package incomplete

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
)

// ReasonExpired is the cancellation reason, and the ACTIVATION's void
// reason, of an INCOMPLETE checkout that was never paid (§9.10 rule 4).
const ReasonExpired = "INCOMPLETE_EXPIRED"

// ErrPaidMeanwhile is an end that found the ACTIVATION paid at the
// provider: there is no end, the payment was applied (§9.10 rule 4).
var ErrPaidMeanwhile = errors.New("incomplete: the activation was paid meanwhile")

// Ender ends INCOMPLETE subscriptions unpaid: at their expiry, or by a
// cancel (§9.10 rules 4 and 5).
type Ender struct {
	deps access.Deps
	box  *outbox.ScopedRepository
}

func NewEnder(deps access.Deps) *Ender {
	return &Ender{deps: deps, box: outbox.NewScopedRepository(deps.Uof)}
}

// End voids the open ACTIVATION at the provider first, outside any
// transaction, then, in one: VOID with voidReason, the subscription CANCELED
// with cancellationReason, the selection dropped unapplied -- nothing of it
// was applied, so nothing is undone -- the licence left as it is with no
// fallback move, and instance.invoice.v1.voided and
// instance.billing.canceled (IMMEDIATE, no FINAL). An ACTIVATION the provider
// reports paid ends nothing: the payment is applied instead, and End answers
// ErrPaidMeanwhile. Provider failures are answered under operation.
func (e *Ender) End(ctx context.Context, operation string, sub db.InstanceBilling, reason *string, actor uuid.UUID) (db.InstanceBilling, error) {
	q := e.deps.Queries(ctx)
	activation, err := q.GetOpenActivation(ctx, sub.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return db.InstanceBilling{}, err
	}
	open := err == nil
	if open {
		paid, err := e.voidAtProvider(ctx, operation, activation)
		if err != nil {
			return db.InstanceBilling{}, err
		}
		if paid {
			return db.InstanceBilling{}, e.applyPaid(ctx, activation)
		}
	}
	var ended db.InstanceBilling
	err = e.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := e.deps.Queries(ctx)
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		if open {
			voidReason := ReasonExpired
			if reason != nil && *reason != ReasonExpired {
				voidReason = "INCOMPLETE_CANCELED"
			}
			voided, err := q.VoidInvoice(ctx, db.VoidInvoiceParams{Now: invoices.Timestamp(now), UserID: nil, Reason: &voidReason, ID: activation.ID})
			if err != nil {
				return err
			}
			invoice, err := invoices.FromRow(voided)
			if err != nil {
				return err
			}
			if err := invoices.Announce(ctx, e.box, sub.OrganizationID, events.InstanceInvoiceVoided,
				invoices.VoidedInvoice{InvoiceSummary: invoice.InvoiceSummary, VoidReason: voidReason}); err != nil {
				return err
			}
		}
		ended, err = q.EndIncomplete(ctx, db.EndIncompleteParams{Now: invoices.Timestamp(now), Reason: reason, UserID: actor, ID: sub.ID})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrPaidMeanwhile // settled or ended by another caller meanwhile
		}
		if err != nil {
			return err
		}
		return lifecycle.AnnounceCanceled(ctx, q, e.box, e.deps.Catalogue, ended, "IMMEDIATE", nil)
	})
	return ended, err
}

// voidAtProvider is the provider's leg of the void, first: Kaiten shows VOID
// only once the provider confirms (§12.8). It reports an invoice the provider
// has paid.
func (e *Ender) voidAtProvider(ctx context.Context, operation string, row db.InstanceInvoice) (bool, error) {
	if row.ProviderKind == db.BillingProviderKindNOOP || row.ExternalInvoiceID == nil {
		return false, nil
	}
	conn, err := providers.Connect(ctx, e.deps.Providers, row.OrganizationID, row.ProviderKind)
	if err != nil {
		return false, providers.APIError(operation, err)
	}
	callCtx, cancel := providers.Bound(ctx, e.deps.ProviderTimeout)
	read, err := conn.Adapter.GetInvoice(callCtx, conn.Ref, *row.ExternalInvoiceID)
	cancel()
	switch {
	case provider.ClassOf(err) == provider.ClassNotFound:
		return false, nil
	case err != nil:
		return false, providers.APIError(operation, err)
	case read.Status == provider.StatusPaid:
		return true, nil
	case read.Status == provider.StatusVoid:
		return false, nil
	}
	callCtx, cancel = providers.Bound(ctx, e.deps.ProviderTimeout)
	err = conn.Adapter.VoidInvoice(callCtx, conn.Ref, *row.ExternalInvoiceID)
	cancel()
	if err != nil {
		return false, providers.APIError(operation, err)
	}
	return false, nil
}

// applyPaid records an ACTIVATION the provider reports paid, and the
// payment's settle (§9.10 rule 4: no expiry then).
func (e *Ender) applyPaid(ctx context.Context, row db.InstanceInvoice) error {
	err := e.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := e.deps.Queries(ctx)
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		updated, err := q.ApplyProviderPaid(ctx, db.ApplyProviderPaidParams{PaidAt: invoices.Timestamp(now), Now: invoices.Timestamp(now), ID: row.ID})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // settled meanwhile
		}
		if err != nil {
			return err
		}
		invoice, err := invoices.FromRow(updated)
		if err != nil {
			return err
		}
		if err := invoices.Announce(ctx, e.box, row.OrganizationID, events.InstanceInvoicePaid,
			invoices.PaidInvoice{InvoiceSummary: invoice.InvoiceSummary, Source: "PROVIDER", ExternalReference: nil, Note: nil}); err != nil {
			return err
		}
		_, err = Settle(ctx, e.deps, e.box, q, updated, now)
		return err
	})
	if err != nil {
		return err
	}
	return ErrPaidMeanwhile
}

// Expiry is billing-lifecycle step (d): the INCOMPLETE checkouts past
// incomplete_expires_at end, as system:kaiten.
type Expiry struct{ ender *Ender }

func NewExpiry(ender *Ender) *Expiry { return &Expiry{ender: ender} }

// Pass ends up to limit expired checkouts; one that fails is logged and
// tried again by the next pass.
func (x *Expiry) Pass(ctx context.Context, limit int) (int, error) {
	q := x.ender.deps.Queries(ctx)
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return 0, err
	}
	rows, err := q.ListExpiredIncomplete(ctx, db.ListExpiredIncompleteParams{
		Now: invoices.Timestamp(now), PageSize: int32(limit), //nolint:gosec // bounded by the batch size
	})
	if err != nil {
		return 0, err
	}
	ended := 0
	reason := ReasonExpired
	for _, sub := range rows {
		actor, err := lifecycle.SystemActor(ctx, q, sub.OrganizationID)
		if err != nil {
			slog.WarnContext(ctx, "incomplete expiry: no system actor", "instance_billing_id", sub.ID, "error", err)
			continue
		}
		if _, err := x.ender.End(ctx, "BillingLifecycle", sub, &reason, actor); err != nil {
			if !errors.Is(err, ErrPaidMeanwhile) {
				slog.WarnContext(ctx, "incomplete expiry failed, retried next pass", "instance_billing_id", sub.ID, "error", err)
			}
			continue
		}
		ended++
	}
	return ended, nil
}
