// Package incomplete is the INCOMPLETE subscription's life after its
// checkout (§9.10, V31-63): what the payment of its ACTIVATION applies, and
// what its expiry and its cancel drop.
package incomplete

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
)

// Settle applies what a checkout with an amount due bought, in the
// transaction that records its ACTIVATION PAID (§9.10 rules 3 and 6). An
// INCOMPLETE subscription becomes ACTIVE from now, its P0 floor. A free live
// subscription carrying the checkout in its pending columns is replaced:
// canceled with no invoice, then subscribed ACTIVE on the price the checkout
// bought, with the anchor and the period its ACTIVATION billed. Either way the
// instance moves to the pending version, under the freeze's escape, and the
// add-ons and the voucher are applied under the ids the ACTIVATION's lines
// name, never refused. It answers false for an invoice that is not such an
// ACTIVATION.
func Settle(ctx context.Context, deps access.Deps, box *outbox.ScopedRepository, q *db.Queries, invoice db.InstanceInvoice, now time.Time) (bool, error) {
	if invoice.Kind != db.InvoiceKindACTIVATION || invoice.Status != db.InvoiceStatusPAID {
		return false, nil
	}
	sub, err := q.GetSubscriptionByID(ctx, invoice.InstanceBillingID)
	if err != nil {
		return false, err
	}
	if sub.PendingLicenseID == nil || sub.InstanceID == nil {
		return false, nil
	}
	var selection subscriptions.PendingSelection
	if err := json.Unmarshal(sub.PendingSelection, &selection); err != nil {
		return false, err
	}
	actor, err := lifecycle.SystemActor(ctx, q, sub.OrganizationID)
	if err != nil {
		return false, err
	}
	instance, err := q.GetInstanceSlug(ctx, *sub.InstanceID)
	if err != nil {
		return false, err
	}
	pendingLicenseID := *sub.PendingLicenseID

	if sub.Status != db.InstanceBillingStatusINCOMPLETE {
		if selection.LicensePriceID == nil || !subscriptions.Live(sub.Status) {
			return false, nil
		}
		if err := replaceFree(ctx, deps, box, q, sub, *selection.LicensePriceID, invoice, actor, now); err != nil {
			return false, err
		}
	}
	if instance.LicenseID != pendingLicenseID {
		if err := q.AllowPlanChange(ctx); err != nil {
			return false, err
		}
		if err := q.MoveInstanceToLicense(ctx, db.MoveInstanceToLicenseParams{
			LicenseID: pendingLicenseID, Now: invoices.Timestamp(now), ID: *sub.InstanceID,
		}); err != nil {
			return false, err
		}
		// The version it bought, announced like any other move (§9.10 rule 3).
		if deps.Mover != nil {
			if err := deps.Mover.AnnounceUpdated(ctx, sub.OrganizationID, instance.Slug, nil); err != nil {
				return false, err
			}
		}
	}
	if err := apply(ctx, deps, sub, instance.Slug, selection, invoice, actor, now); err != nil {
		return false, err
	}
	if sub.Status != db.InstanceBillingStatusINCOMPLETE {
		return true, nil // replaceFree announced the start
	}
	settled, err := q.SettleIncomplete(ctx, db.SettleIncompleteParams{Now: invoices.Timestamp(now), UserID: actor, ID: sub.ID})
	if err != nil {
		return false, err
	}
	if err := box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		sub.OrganizationID, events.InstanceBillingStatusChanged.Name, events.InstanceBillingStatusChanged.Type,
		subscriptions.StatusChange{
			InstanceBillingID: settled.ID, InstanceSlug: settled.InstanceSlug,
			From: string(sub.Status), To: string(settled.Status), Reason: "SETTLED",
		}, nil)); err != nil {
		return false, err
	}
	// The anonymous checkout it came from, last: its lock follows the
	// subscription's rows (§9.12 rule 5).
	if deps.Checkouts != nil {
		if err := deps.Checkouts.Paid(ctx, sub.OrganizationID, *sub.InstanceID); err != nil {
			return false, err
		}
	}
	return true, nil
}

// apply attaches the selected add-ons and redeems the voucher, under their
// pending ids, and counts the DISCOUNT line's application.
func apply(ctx context.Context, deps access.Deps, sub db.InstanceBilling, instanceSlug string, selection subscriptions.PendingSelection,
	invoice db.InstanceInvoice, actor uuid.UUID, now time.Time,
) error {
	for _, addon := range selection.AddOns {
		if deps.Attacher == nil {
			break
		}
		if err := deps.Attacher.AttachPaid(ctx, sub.OrganizationID, actor, instanceSlug, addon.InstanceAddonID, addon.AddonSlug, addon.Quantity); err != nil {
			return err
		}
	}
	v := selection.Voucher
	if v == nil || deps.Redeemer == nil {
		return nil
	}
	written, err := deps.Redeemer.RedeemPaid(ctx, sub.OrganizationID, actor, instanceSlug, v.InstanceVoucherID, v.Code)
	if err != nil || !written {
		return err
	}
	// The application the ACTIVATION's DISCOUNT line made counts now that
	// its redemption exists.
	paid, err := invoices.FromRow(invoice)
	if err != nil {
		return err
	}
	composition := rating.Composition{Lines: paid.Lines, Subtotal: 0, DiscountTotal: 0, Total: 0, CurrencySkipped: 0}
	return metering.Consume(ctx, deps.Discounts, sub.OrganizationID, metering.Only(composition, v.InstanceVoucherID), now)
}

// replaceFree replaces the free subscription a paid checkout waited on
// (§9.10 rule 6): canceled with no invoice and no fallback move, then the
// same row subscribed ACTIVE on the bought price, from the anchor and for the
// period the ACTIVATION billed, through its provider, P0 from now.
func replaceFree(ctx context.Context, deps access.Deps, box *outbox.ScopedRepository, q *db.Queries, sub db.InstanceBilling,
	priceID uuid.UUID, invoice db.InstanceInvoice, actor uuid.UUID, now time.Time,
) error {
	// The pending columns go first: a CANCELED row holds none
	// (instance_billing_incomplete_check).
	if _, err := q.ClearPendingCheckout(ctx, db.ClearPendingCheckoutParams{UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID}); err != nil {
		return err
	}
	canceled, err := q.CancelSubscription(ctx, db.CancelSubscriptionParams{
		CanceledAt: invoices.Timestamp(now), Reason: nil, UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
	})
	if err != nil {
		return err
	}
	if err := lifecycle.AnnouncePlanChangeDropped(ctx, box, sub); err != nil {
		return err
	}
	if err := lifecycle.AnnounceCanceled(ctx, q, box, deps.Catalogue, canceled, "IMMEDIATE", nil); err != nil {
		return err
	}
	base, err := deps.Catalogue.Price(ctx, sub.OrganizationID, priceID)
	if err != nil {
		return err
	}
	if base == nil || base.BillingPeriod == nil {
		return errors.New("incomplete: the price a paid checkout bought is gone")
	}
	method := invoice.CollectionMethod
	row, err := q.ResubscribeInstanceBilling(ctx, db.ResubscribeInstanceBillingParams{
		CustomerID: sub.CustomerID, InstanceSlug: sub.InstanceSlug, InstanceName: sub.InstanceName,
		CustomerSlug: sub.CustomerSlug, CustomerName: sub.CustomerName, Status: db.InstanceBillingStatusACTIVE,
		ProviderKind: invoice.ProviderKind, CollectionMethod: &method, DaysUntilDue: nil,
		BaseLicensePriceID: base.ID, BillingPeriod: db.BillingPeriod(*base.BillingPeriod), Currency: base.Currency,
		AnchorAt: invoice.BoundaryAt, CurrentPeriodEnd: invoice.ServiceTo, TrialEndsAt: pgtype.Timestamp{}, TrialWillEndAt: pgtype.Timestamp{},
		PendingLicenseID: nil, PendingSelection: nil, IncompleteExpiresAt: pgtype.Timestamp{},
		UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID, OrganizationID: sub.OrganizationID,
	})
	if err != nil {
		return err
	}
	if row, err = q.SetSubscriptionStartedAt(ctx, db.SetSubscriptionStartedAtParams{StartedAt: invoices.Timestamp(now), ID: row.ID}); err != nil {
		return err
	}
	billing, err := subscriptions.Build(ctx, q, deps.Catalogue, row)
	if err != nil {
		return err
	}
	return box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		sub.OrganizationID, events.InstanceBillingStarted.Name, events.InstanceBillingStarted.Type,
		subscriptions.BillingStarted{InstanceBilling: *billing, Resubscribed: true}, nil))
}
