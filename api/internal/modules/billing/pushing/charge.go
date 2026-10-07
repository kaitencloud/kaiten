package pushing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
)

// charge is push step 4, for an issued invoice the provider charges
// (CHARGE_AUTOMATICALLY): one off-session charge, under one idempotency key
// whatever the number of attempts. A known outcome settles the invoice (PAID)
// or records the refusal (PAYMENT_FAILED); an unknown one leaves it PUSHED and
// due again after a backoff, and the next attempt charges under the same key,
// so a charge is never made twice. A refused charge moves the subscription to
// PAST_DUE at once; one waiting for the customer to authenticate only after
// the auto-collection grace (§9.6 rule 1).
func (p *Pusher) charge(ctx context.Context, conn *provider.Connection, row db.InstanceInvoice, normalized provider.NormalizedInvoice) error {
	callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
	outcome, err := conn.Adapter.Pay(callCtx, conn.Ref, deref(row.ExternalInvoiceID), normalized)
	cancel()
	q := p.deps.Queries(ctx)
	now, nowErr := lifecycle.Now(ctx, q)
	if nowErr != nil {
		return nowErr
	}
	if err != nil {
		return p.chargeUnknown(ctx, row, err, now)
	}

	return p.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := p.deps.Queries(ctx)
		var updated db.InstanceInvoice
		var err error
		switch outcome.Status {
		case provider.PaymentPaid:
			paidAt := now
			if outcome.Invoice.PaidAt != nil {
				paidAt = outcome.Invoice.PaidAt.UTC().Truncate(time.Millisecond)
			}
			updated, err = q.ApplyProviderPaid(ctx, db.ApplyProviderPaidParams{PaidAt: invoices.Timestamp(paidAt), Now: invoices.Timestamp(now), ID: row.ID})
		default:
			code := outcome.Code
			updated, err = q.ApplyPaymentFailed(ctx, db.ApplyPaymentFailedParams{
				FailedAt: invoices.Timestamp(now), LastPaymentError: &code, Now: invoices.Timestamp(now), ID: row.ID,
			})
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // settled meanwhile (sync, void)
		}
		if err != nil {
			return err
		}
		invoice, err := invoices.FromRow(updated)
		if err != nil {
			return err
		}
		if outcome.Status == provider.PaymentPaid {
			if err := invoices.Announce(ctx, p.outbox, row.OrganizationID, events.InstanceInvoicePaid, invoices.PaidInvoice{
				InvoiceSummary: invoice.InvoiceSummary, Source: "PROVIDER", ExternalReference: nil, Note: nil,
			}); err != nil {
				return err
			}
		} else {
			if err := p.paymentMethodRefused(ctx, q, row, outcome.Code, now); err != nil {
				return err
			}
			if err := invoices.Announce(ctx, p.outbox, row.OrganizationID, events.InstanceInvoicePaymentFailed, invoices.PaymentFailedInvoice{
				InvoiceSummary: invoice.InvoiceSummary, FailureCode: outcome.Code,
				RequiresAction: outcome.Status == provider.PaymentRequiresAction,
			}); err != nil {
				return err
			}
		}
		sub, err := q.GetSubscriptionByID(ctx, row.InstanceBillingID)
		if err != nil {
			return err
		}
		_, err = lifecycle.Reevaluate(ctx, q, p.outbox, sub, sub.UpdatedByID, now, p.deps.AutoCollectionGrace)
		return err
	})
}

// paymentMethodRefused records on the customer what a refused charge says of
// its payment method: expired, failed, or gone from the provider.
func (p *Pusher) paymentMethodRefused(ctx context.Context, q *db.Queries, row db.InstanceInvoice, code string, now time.Time) error {
	if row.CustomerID == nil {
		return nil
	}
	key := db.MarkPaymentMethodStatusParams{
		OrganizationID: row.OrganizationID, CustomerID: *row.CustomerID, ProviderKind: row.ProviderKind, Now: invoices.Timestamp(now),
	}
	switch code {
	case provider.PaymentCodeAuthenticationRequired:
		return nil // the method is fine; the customer must confirm
	case provider.PaymentCodeNoPaymentMethod:
		_, err := q.ClearPaymentMethod(ctx, db.ClearPaymentMethodParams{
			Now: invoices.Timestamp(now), OrganizationID: row.OrganizationID, CustomerID: *row.CustomerID, ProviderKind: row.ProviderKind,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	case provider.PaymentCodeExpiredCard:
		key.Status = db.PaymentMethodStatusEXPIRED
	default:
		key.Status = db.PaymentMethodStatusFAILED
	}
	return q.MarkPaymentMethodStatus(ctx, key)
}

// chargeUnknown records a charge whose outcome is unknown: retried, under the
// same key, after the push backoff.
func (p *Pusher) chargeUnknown(ctx context.Context, row db.InstanceInvoice, cause error, now time.Time) error {
	attempts := int(row.PushAttempts) + 1
	summary := provider.Summary(cause)
	_, err := p.deps.Queries(ctx).MarkChargeUnknown(ctx, db.MarkChargeUnknownParams{
		LastPushError: &summary, NextPushAt: invoices.Timestamp(now.Add(p.backoff(attempts))), Now: invoices.Timestamp(now), ID: row.ID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	slog.WarnContext(ctx, "invoice charge outcome unknown, retried later", "invoice_id", row.ID, "error", summary)
	return fmt.Errorf("charge of invoice %s: %w", row.ID, cause)
}
