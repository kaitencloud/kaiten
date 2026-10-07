// Package syncing mirrors what payment providers report about the invoices
// they issue: payments by any path, voids and drafts deleted in the provider,
// finalizations done by a human there.
//
// A pass per (organization, provider) reads the provider's change feed from
// its cursor (with an overlap, every event idempotent), then, once a day,
// every open invoice by id, which covers events the feed no longer holds.
// Events are a change feed only: each one triggers a read of the invoice by
// id, and that state is applied. Transitions only advance, so applying a
// state twice, or out of order, changes nothing.
package syncing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoiceaction"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/pushing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
)

const (
	// overlap is how far before its cursor a pass reads the feed again.
	overlap = 5 * time.Minute
	// sweepEvery is how often every open invoice is read by id.
	sweepEvery = 24 * time.Hour
	// sweepBatch bounds the invoices one sweep reads.
	sweepBatch = 500
	// failuresBeforeAlert is the failed passes in a row that are announced.
	failuresBeforeAlert = 3
)

// Statuses of a pass, as billing_sync_state records them.
const (
	StatusSuccess = "SUCCESS"
	StatusPartial = "PARTIAL"
	StatusFailed  = "FAILED"
)

// Syncer mirrors providers' reports.
type Syncer struct {
	deps    access.Deps
	outbox  *outbox.ScopedRepository
	timeout time.Duration
}

// New returns a syncer whose provider calls are bounded by timeout.
func New(deps access.Deps, timeout time.Duration) *Syncer {
	return &Syncer{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof), timeout: timeout}
}

// Outcome is one organization's pass with one provider.
type Outcome struct {
	ProviderKind string    `json:"providerKind" enum:"NOOP,STRIPE"`
	Status       string    `json:"status" enum:"SUCCESS,PARTIAL,FAILED"`
	Applied      int       `json:"applied" doc:"Invoices read and applied"`
	Failed       int       `json:"failed" doc:"Invoices that could not be read or applied"`
	SyncedAt     time.Time `json:"syncedAt"`
	Error        *string   `json:"error,omitempty"`
}

// Pass syncs every (organization, provider) with something to mirror.
func (s *Syncer) Pass(ctx context.Context) error {
	q := s.deps.Queries(ctx)
	targets, err := q.ListSyncTargets(ctx)
	if err != nil {
		return err
	}
	for _, target := range targets {
		if _, err := s.Organization(ctx, target.OrganizationID, target.ProviderKind); err != nil {
			if !errors.Is(err, provider.ErrNotConnected) {
				slog.WarnContext(ctx, "billing provider sync failed", "organization_id", target.OrganizationID,
					"provider_kind", target.ProviderKind, "error", err)
			}
		}
	}
	return nil
}

// Organization runs one pass for an organization's provider and records it.
// provider.ErrNotConnected when the organization has not connected it.
func (s *Syncer) Organization(ctx context.Context, organizationID uuid.UUID, kind db.BillingProviderKind) (Outcome, error) {
	conn, err := providers.Connect(ctx, s.deps.Providers, organizationID, kind)
	if err != nil {
		return Outcome{}, err
	}
	q := s.deps.Queries(ctx)
	state, err := q.GetSyncState(ctx, db.GetSyncStateParams{OrganizationID: organizationID, ProviderKind: kind})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Outcome{}, err
	}
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return Outcome{}, err
	}
	outcome := Outcome{ProviderKind: string(kind), Status: StatusSuccess, Applied: 0, Failed: 0, SyncedAt: now, Error: nil}
	var failedIDs []string
	seen := map[string]bool{}
	apply := func(externalID string) {
		if seen[externalID] {
			return
		}
		seen[externalID] = true
		row, err := q.GetInvoiceByExternalID(ctx, db.GetInvoiceByExternalIDParams{
			OrganizationID: organizationID, ProviderKind: kind, ExternalInvoiceID: &externalID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return // not an invoice of Kaiten's
		}
		if err == nil {
			_, err = s.apply(ctx, conn, row)
		}
		if err != nil {
			outcome.Failed++
			failedIDs = append(failedIDs, externalID)
			slog.WarnContext(ctx, "provider invoice could not be applied", "external_invoice_id", externalID, "error", err)
			return
		}
		outcome.Applied++
	}

	cursor, cursorAt := deref(state.Cursor), state.CursorCreatedAt
	if conn.Adapter.Capabilities().EventFeed {
		since := time.Time{}
		if cursorAt.Valid {
			since = cursorAt.Time.Add(-overlap)
		}
		callCtx, cancel := providers.Bound(ctx, s.timeout)
		feed, next, err := conn.Adapter.ListInvoiceEvents(callCtx, conn.Ref, cursor, since)
		cancel()
		if err != nil {
			return s.record(ctx, organizationID, kind, state, outcome, StatusFailed, provider.Summary(err), now)
		}
		for _, event := range feed {
			if event.ExternalInvoiceID != "" {
				apply(event.ExternalInvoiceID)
			}
			cursorAt = invoices.Timestamp(event.CreatedAt)
		}
		cursor = next
	}
	sweptAt := state.LastFullSweepAt
	if !conn.Adapter.Capabilities().EventFeed || !sweptAt.Valid || now.Sub(sweptAt.Time) >= sweepEvery {
		open, err := q.ListOpenProviderInvoices(ctx, db.ListOpenProviderInvoicesParams{
			OrganizationID: organizationID, ProviderKind: kind, Batch: sweepBatch,
		})
		if err != nil {
			return Outcome{}, err
		}
		for _, row := range open {
			apply(deref(row.ExternalInvoiceID))
		}
		sweptAt = invoices.Timestamp(now)
	}
	state.Cursor, state.CursorCreatedAt, state.LastFullSweepAt = optional(cursor), cursorAt, sweptAt
	if len(failedIDs) > 0 {
		return s.record(ctx, organizationID, kind, state, outcome, StatusPartial, "could not apply "+strings.Join(failedIDs, ", "), now)
	}
	return s.record(ctx, organizationID, kind, state, outcome, StatusSuccess, "", now)
}

// record writes the pass's outcome; a feed failure counts towards an alert,
// announced once per streak.
func (s *Syncer) record(ctx context.Context, organizationID uuid.UUID, kind db.BillingProviderKind, state db.BillingSyncState,
	outcome Outcome, status, message string, now time.Time,
) (Outcome, error) {
	failures := int32(0)
	if status == StatusFailed {
		failures = state.ConsecutiveFailures + 1
	}
	outcome.Status = status
	var lastError *string
	if message != "" {
		lastError = &message
		outcome.Error = &message
	}
	syncStatus := db.BillingSyncStatus(status)
	err := s.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := s.deps.Queries(ctx)
		if err := q.SaveSyncState(ctx, db.SaveSyncStateParams{
			OrganizationID: organizationID, ProviderKind: kind, Cursor: state.Cursor, CursorCreatedAt: state.CursorCreatedAt,
			LastSyncedAt: invoices.Timestamp(now), LastSyncStatus: &syncStatus, LastSyncError: lastError,
			ConsecutiveFailures: failures, LastFullSweepAt: state.LastFullSweepAt,
		}); err != nil {
			return err
		}
		if failures != failuresBeforeAlert {
			return nil
		}
		return invoices.Announce(ctx, s.outbox, organizationID, events.BillingProviderSyncFailed, SyncFailure{
			ProviderKind: string(kind), ConsecutiveFailures: failures, LastSyncError: message, LastSyncedAt: now,
		})
	})
	return outcome, err
}

// SyncFailure is the payload of BILLING_PROVIDER_SYNC_FAILED.
type SyncFailure struct {
	ProviderKind        string    `json:"providerKind"`
	ConsecutiveFailures int32     `json:"consecutiveFailures"`
	LastSyncError       string    `json:"lastSyncError"`
	LastSyncedAt        time.Time `json:"lastSyncedAt"`
}

// Invoice reads one invoice from its provider and applies what it says.
func (s *Syncer) Invoice(ctx context.Context, row db.InstanceInvoice) (db.InstanceInvoice, error) {
	conn, err := providers.Connect(ctx, s.deps.Providers, row.OrganizationID, row.ProviderKind)
	if err != nil {
		return row, err
	}
	return s.apply(ctx, conn, row)
}

// apply reads an invoice by id and applies the provider's state:
//   - a finalization done in the provider makes it PUSHED (then reconciled);
//   - paid, uncollectible and void are mirrored; a draft deleted in the
//     provider makes it VOID;
//   - each change re-evaluates the subscription's PAST_DUE.
func (s *Syncer) apply(ctx context.Context, conn *provider.Connection, row db.InstanceInvoice) (db.InstanceInvoice, error) {
	if row.ExternalInvoiceID == nil {
		return row, nil
	}
	callCtx, cancel := providers.Bound(ctx, s.timeout)
	read, err := conn.Adapter.GetInvoice(callCtx, conn.Ref, *row.ExternalInvoiceID)
	cancel()
	deleted := provider.ClassOf(err) == provider.ClassNotFound
	if err != nil && !deleted {
		return row, err
	}

	q := s.deps.Queries(ctx)
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return row, err
	}
	if !deleted && (read.Status == provider.StatusOpen || read.Status == provider.StatusPaid) &&
		(row.Status == db.InvoiceStatusDRAFT || row.Status == db.InvoiceStatusPUSHFAILED) {
		sub, err := q.GetSubscriptionByID(ctx, row.InstanceBillingID)
		if err != nil {
			return row, err
		}
		defaults, err := settings.Read(ctx, q, row.OrganizationID)
		if err != nil {
			return row, err
		}
		pushed, err := pushing.Finalized(ctx, s.deps, s.outbox, row, read, subscriptions.Terms(sub, defaults).DaysUntilDue, now)
		if err != nil {
			return row, err
		}
		if pushed != nil {
			row = *pushed
		}
	}

	var updated *db.InstanceInvoice
	err = s.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := s.deps.Queries(ctx)
		sub, locked, err := invoiceaction.Lock(ctx, q, row.OrganizationID, row.ID, "SyncInvoice.NotFound")
		if err != nil {
			return err
		}
		changed, err := s.mirror(ctx, q, locked, read, deleted, now)
		if err != nil || changed == nil {
			return err
		}
		updated = changed
		_, err = lifecycle.Reevaluate(ctx, q, s.outbox, sub, sub.UpdatedByID, now, s.deps.AutoCollectionGrace)
		return err
	})
	if err != nil {
		return row, err
	}
	if updated != nil {
		row = *updated
	} else if latest, err := q.GetInvoiceByID(ctx, row.ID); err == nil {
		row = latest
	}
	if !deleted && row.ReconciliationStatus == nil && row.Status != db.InvoiceStatusDRAFT &&
		row.Status != db.InvoiceStatusPUSHFAILED && row.Status != db.InvoiceStatusVOID {
		if err := pushing.Reconcile(ctx, s.deps, s.outbox, row, read, conn.InclusiveTax); err != nil {
			return row, err
		}
		if latest, err := q.GetInvoiceByID(ctx, row.ID); err == nil {
			row = latest
		}
	}
	return row, nil
}

// mirror applies a provider's status to a locked invoice; nil when nothing
// changed.
func (s *Syncer) mirror(ctx context.Context, q *db.Queries, row db.InstanceInvoice, read provider.Invoice, deleted bool, now time.Time) (*db.InstanceInvoice, error) {
	at := func(t *time.Time) time.Time {
		if t == nil {
			return now
		}
		return t.UTC().Truncate(time.Millisecond)
	}
	var (
		updated  db.InstanceInvoice
		err      error
		announce func(invoices.Invoice) error
	)
	switch {
	case deleted:
		status := "void"
		updated, err = q.ApplyProviderVoid(ctx, db.ApplyProviderVoidParams{
			VoidedAt: invoices.Timestamp(now), VoidReason: optional("provider_draft_deleted"), ProviderStatus: &status,
			Now: invoices.Timestamp(now), ID: row.ID,
		})
		announce = s.voided(ctx, row.OrganizationID, "provider_draft_deleted")
	case read.Status == provider.StatusPaid:
		updated, err = q.ApplyProviderPaid(ctx, db.ApplyProviderPaidParams{PaidAt: invoices.Timestamp(at(read.PaidAt)), Now: invoices.Timestamp(now), ID: row.ID})
		announce = func(invoice invoices.Invoice) error {
			return invoices.Announce(ctx, s.outbox, row.OrganizationID, events.InstanceInvoicePaid,
				invoices.PaidInvoice{InvoiceSummary: invoice.InvoiceSummary, Source: "PROVIDER", ExternalReference: nil, Note: nil})
		}
	case read.Status == provider.StatusUncollectible:
		updated, err = q.ApplyProviderUncollectible(ctx, db.ApplyProviderUncollectibleParams{
			UncollectibleAt: invoices.Timestamp(at(read.UncollectibleAt)), Now: invoices.Timestamp(now), ID: row.ID,
		})
		announce = func(invoice invoices.Invoice) error {
			return invoices.Announce(ctx, s.outbox, row.OrganizationID, events.InstanceInvoiceMarkedUncollectible,
				invoices.UncollectibleInvoice{InvoiceSummary: invoice.InvoiceSummary, Reason: "marked uncollectible in the payment provider"})
		}
	case read.Status == provider.StatusVoid:
		status := "void"
		updated, err = q.ApplyProviderVoid(ctx, db.ApplyProviderVoidParams{
			VoidedAt: invoices.Timestamp(at(read.VoidedAt)), VoidReason: optional("voided_in_provider"), ProviderStatus: &status,
			Now: invoices.Timestamp(now), ID: row.ID,
		})
		announce = s.voided(ctx, row.OrganizationID, "voided_in_provider")
	default:
		return nil, q.TouchProviderInvoice(ctx, db.TouchProviderInvoiceParams{Now: invoices.Timestamp(now), ID: row.ID})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, q.TouchProviderInvoice(ctx, db.TouchProviderInvoiceParams{Now: invoices.Timestamp(now), ID: row.ID})
	}
	if err != nil {
		return nil, err
	}
	invoice, err := invoices.FromRow(updated)
	if err != nil {
		return nil, err
	}
	if err := announce(invoice); err != nil {
		return nil, fmt.Errorf("announce provider change of invoice %s: %w", row.ID, err)
	}
	return &updated, nil
}

// voided announces a void seen in the provider, in the transaction ctx
// carries.
func (s *Syncer) voided(ctx context.Context, organizationID uuid.UUID, reason string) func(invoices.Invoice) error {
	return func(invoice invoices.Invoice) error {
		return invoices.Announce(ctx, s.outbox, organizationID, events.InstanceInvoiceVoided,
			invoices.VoidedInvoice{InvoiceSummary: invoice.InvoiceSummary, VoidReason: reason})
	}
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// RegisterWebhooks declares BILLING_PROVIDER_SYNC_FAILED.
func RegisterWebhooks(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.BillingProviderSyncFailed,
		Data:        (*SyncFailure)(nil),
		OperationID: "onBillingProviderSyncFailed",
		Summary:     "Billing Provider Sync Failed Webhook",
		Description: "Triggered when syncing with a payment provider has failed three passes in a row, once per streak.",
		Tags:        []string{"webhooks", "billing"},
	})
}
