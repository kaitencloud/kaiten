package pushing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/telemetry"
)

// Finalized records that the provider issued an invoice, whether Kaiten
// finalized it or a human did in the provider: PUSHED, issued at the
// provider's finalization, due after the terms' days, in the handoff queue
// when the organization asks for every invoice there. Announces
// INSTANCE_INVOICE_ISSUED then INSTANCE_INVOICE_PUSHED. nil when the invoice
// is no longer pushable (voided meanwhile).
func Finalized(ctx context.Context, deps access.Deps, box *outbox.ScopedRepository, row db.InstanceInvoice,
	read provider.Invoice, daysUntilDue int32, now time.Time,
) (*db.InstanceInvoice, error) {
	issuedAt := now
	if read.FinalizedAt != nil {
		issuedAt = read.FinalizedAt.UTC().Truncate(time.Millisecond)
	}
	if row.CollectionMethod == db.CollectionMethodCHARGEAUTOMATICALLY {
		daysUntilDue = 0
	}
	var pushed *db.InstanceInvoice
	err := deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := deps.Queries(ctx)
		defaults, err := settings.Read(ctx, q, row.OrganizationID)
		if err != nil {
			return err
		}
		handoff := db.HandoffStatusNOTREQUIRED
		if defaults.HandoffStripeInvoices {
			handoff = db.HandoffStatusPENDING
		}
		updated, err := q.MarkPushed(ctx, db.MarkPushedParams{
			ProviderStatus: optional(string(read.Status)), ProviderInvoiceNumber: optional(read.Number),
			HostedInvoiceUrl: optional(read.HostedURL), InvoicePdfUrl: optional(read.PDFURL),
			IssuedAt: invoices.Timestamp(issuedAt), DaysUntilDue: &daysUntilDue, HandoffStatus: handoff,
			Now: invoices.Timestamp(now), ID: row.ID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		pushed = &updated
		invoice, err := invoices.FromRow(updated)
		if err != nil {
			return err
		}
		if err := invoices.Announce(ctx, box, row.OrganizationID, events.InstanceInvoiceIssued, invoices.Issued(invoice)); err != nil {
			return err
		}
		return invoices.Announce(ctx, box, row.OrganizationID, events.InstanceInvoicePushed, invoices.PushedInvoice{
			InvoiceSummary: invoice.InvoiceSummary, ExternalInvoiceID: deref(updated.ExternalInvoiceID),
			ProviderInvoiceNumber: updated.ProviderInvoiceNumber,
		})
	})
	return pushed, err
}

// Reconcile compares an issued invoice with its provider's copy and records
// the outcome, once. A mismatch is announced; the invoice is not changed.
func Reconcile(ctx context.Context, deps access.Deps, box *outbox.ScopedRepository, row db.InstanceInvoice, read provider.Invoice, inclusiveTax bool) error {
	if row.ReconciliationStatus != nil {
		return nil
	}
	var lines []rating.InvoiceLine
	if err := json.Unmarshal(row.Lines, &lines); err != nil {
		return fmt.Errorf("decode lines of invoice %s: %w", row.ID, err)
	}
	outcome := providers.Reconcile(lines, row.TotalMinor, row.Currency, read, inclusiveTax)
	encoded, err := encodeLines(outcome.Lines)
	if err != nil {
		return err
	}
	status := db.ReconciliationStatusMATCHED
	var detail []byte
	if !outcome.Matched {
		status = db.ReconciliationStatusMISMATCH
		if detail, err = json.Marshal(outcome.Detail); err != nil {
			return err
		}
	}
	return deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := deps.Queries(ctx)
		now, err := lifecycleNow(ctx, q)
		if err != nil {
			return err
		}
		total := read.TotalExcludingTax
		affected, err := q.SetReconciliation(ctx, db.SetReconciliationParams{
			ReconciliationStatus: &status, ReconciliationDetail: detail, Now: invoices.Timestamp(now),
			ProviderTotalExcludingTaxMinor: &total, Lines: encoded, ID: row.ID,
		})
		if err != nil || affected == 0 || outcome.Matched {
			return err
		}
		telemetry.Mismatched(ctx, string(row.ProviderKind))
		updated, err := q.GetInvoiceByID(ctx, row.ID)
		if err != nil {
			return err
		}
		return invoices.Announce(ctx, box, row.OrganizationID, events.InstanceInvoiceReconciliationMismatch, invoices.MismatchedInvoice{
			InvoiceSummary: invoices.Summary(updated), ReconciliationDetail: *outcome.Detail,
		})
	})
}

// Settle reconciles an issued invoice with its provider's copy, then deletes
// the discounts the push created for it: they have served, and deleting a
// coupon leaves the discounts a finalized invoice applied as they are
// (CR-001 §4 rule 5). Once: an invoice reconciled already is left alone.
func Settle(ctx context.Context, deps access.Deps, box *outbox.ScopedRepository, conn *provider.Connection, row db.InstanceInvoice,
	read provider.Invoice, timeout time.Duration,
) error {
	if row.ReconciliationStatus != nil {
		return nil
	}
	if err := Reconcile(ctx, deps, box, row, read, conn.InclusiveTax); err != nil {
		return err
	}
	var lines []rating.InvoiceLine
	if err := json.Unmarshal(row.Lines, &lines); err != nil {
		return fmt.Errorf("decode lines of invoice %s: %w", row.ID, err)
	}
	providers.ReleaseDiscounts(ctx, conn, row.ID, lines, timeout)
	return nil
}

func encodeLines(lines []rating.InvoiceLine) ([]byte, error) {
	if lines == nil {
		lines = []rating.InvoiceLine{}
	}
	encoded, err := json.Marshal(lines)
	if err != nil {
		return nil, fmt.Errorf("encode invoice lines: %w", err)
	}
	return encoded, nil
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
