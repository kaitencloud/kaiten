// Package incomplete is the INCOMPLETE subscription's life after its
// checkout (§9.10, V31-63): what the payment of its ACTIVATION applies, and
// what its expiry and its cancel drop.
package incomplete

import (
	"context"
	"encoding/json"
	"time"

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

// Settle applies what an INCOMPLETE checkout bought, in the transaction that
// records its ACTIVATION PAID (§9.10 rule 3): the instance moves to the
// pending version, under the freeze's escape; the selected add-ons are
// attached and the voucher redeemed under the ids the ACTIVATION's lines
// name, never refused; the subscription becomes ACTIVE from now, its P0
// floor, the pending columns cleared. Anything else is left to the caller:
// it answers false for an invoice that is not such an ACTIVATION.
func Settle(ctx context.Context, deps access.Deps, box *outbox.ScopedRepository, q *db.Queries, invoice db.InstanceInvoice, now time.Time) (bool, error) {
	if invoice.Kind != db.InvoiceKindACTIVATION || invoice.Status != db.InvoiceStatusPAID {
		return false, nil
	}
	sub, err := q.GetSubscriptionByID(ctx, invoice.InstanceBillingID)
	if err != nil {
		return false, err
	}
	if sub.Status != db.InstanceBillingStatusINCOMPLETE || sub.PendingLicenseID == nil || sub.InstanceID == nil {
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
	if instance.LicenseID != *sub.PendingLicenseID {
		if err := q.AllowPlanChange(ctx); err != nil {
			return false, err
		}
		if err := q.MoveInstanceToLicense(ctx, db.MoveInstanceToLicenseParams{
			LicenseID: *sub.PendingLicenseID, Now: invoices.Timestamp(now), ID: *sub.InstanceID,
		}); err != nil {
			return false, err
		}
	}
	for _, addon := range selection.AddOns {
		if deps.Attacher == nil {
			break
		}
		if err := deps.Attacher.AttachPaid(ctx, sub.OrganizationID, actor, instance.Slug, addon.InstanceAddonID, addon.AddonSlug, addon.Quantity); err != nil {
			return false, err
		}
	}
	if v := selection.Voucher; v != nil && deps.Redeemer != nil {
		written, err := deps.Redeemer.RedeemPaid(ctx, sub.OrganizationID, actor, instance.Slug, v.InstanceVoucherID, v.Code)
		if err != nil {
			return false, err
		}
		if written {
			// The application the ACTIVATION's DISCOUNT line made counts now
			// that its redemption exists.
			paid, err := invoices.FromRow(invoice)
			if err != nil {
				return false, err
			}
			composition := rating.Composition{Lines: paid.Lines, Subtotal: 0, DiscountTotal: 0, Total: 0, CurrencySkipped: 0}
			if err := metering.Consume(ctx, deps.Discounts, sub.OrganizationID, metering.Only(composition, v.InstanceVoucherID), now); err != nil {
				return false, err
			}
		}
	}
	settled, err := q.SettleIncomplete(ctx, db.SettleIncompleteParams{Now: invoices.Timestamp(now), UserID: actor, ID: sub.ID})
	if err != nil {
		return false, err
	}
	return true, box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		sub.OrganizationID, events.InstanceBillingStatusChanged.Name, events.InstanceBillingStatusChanged.Type,
		subscriptions.StatusChange{
			InstanceBillingID: settled.ID, InstanceSlug: settled.InstanceSlug,
			From: string(sub.Status), To: string(settled.Status), Reason: "SETTLED",
		}, nil))
}
