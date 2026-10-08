// Package pushing pushes invoices to the payment providers that issue them.
//
// An invoice of a provider that pushes invoices is composed as a DRAFT in the
// push queue. A push runs these steps, each persisted in its own short
// transaction right after the provider answers, so that a retry resumes at the
// first step without a result:
//
//  0. ensure the provider's customer;
//  1. create the provider's draft (adopting one an earlier attempt created
//     but could not record);
//     2a. create the provider discount of each allocation of each DISCOUNT
//     line, in seq order (idempotent beyond any key horizon);
//     2b. add each line other than DISCOUNT ones, in seq order, bearing its
//     discounts (adopting the ones already there, re-creating one whose
//     discounts are not the expected ones): no line is ever negative
//     (CR-001);
//  3. finalize, unless the provider's settings ask for review, in which case
//     the draft waits in the provider for a human or for retry-push;
//  4. charge it, under automatic collection;
//  5. read the invoice back, reconcile it, then delete its discounts, which
//     have served.
//
// Every write after a provider call is conditional on the invoice still
// being pushable: when it was voided meanwhile, the run compensates the
// object it just created in the provider and stops. A failed step makes the
// invoice PUSH_FAILED, tried again after a doubling backoff.
package pushing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

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
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/telemetry"
)

// Config tunes the push.
type Config struct {
	// MaxBackoff caps the wait before a failed push is tried again.
	MaxBackoff time.Duration
	// AlertAfterAttempts is the failed attempts after which a failure is
	// announced.
	AlertAfterAttempts int
	// Timeout bounds one provider call.
	Timeout time.Duration
	// BatchSize bounds the invoices one pass pushes.
	BatchSize int
}

// lease is how long a pass holds an invoice it pushes against another pass.
const lease = 10 * time.Minute

// Pusher pushes invoices.
type Pusher struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
	cfg    Config
}

// New returns a pusher.
func New(deps access.Deps, cfg Config) *Pusher {
	if cfg.MaxBackoff <= 0 {
		cfg.MaxBackoff = 6 * time.Hour
	}
	if cfg.AlertAfterAttempts <= 0 {
		cfg.AlertAfterAttempts = 5
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 50
	}
	return &Pusher{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof), cfg: cfg}
}

// Pass leases and pushes the invoices due in the queue, each on its own; one
// that fails is recorded on the invoice and logged.
func (p *Pusher) Pass(ctx context.Context) (pushed int, err error) {
	kinds := p.pushingKinds()
	if len(kinds) == 0 {
		return 0, nil
	}
	q := p.deps.Queries(ctx)
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return 0, err
	}
	ids, err := q.ClaimPushBatch(ctx, db.ClaimPushBatchParams{
		LeaseUntil: invoices.Timestamp(now.Add(lease)), Now: invoices.Timestamp(now), Kinds: kinds,
		Batch: int32(p.cfg.BatchSize), //nolint:gosec // bounded by the configuration
	})
	if err != nil {
		return 0, err
	}
	for _, id := range ids {
		if err := p.Push(ctx, id, false); err != nil {
			slog.WarnContext(ctx, "invoice push failed", "invoice_id", id, "error", err)
			continue
		}
		pushed++
	}
	return pushed, nil
}

// pushingKinds are the providers this deployment knows that push invoices:
// the queue holds no invoice of a provider it cannot reach.
func (p *Pusher) pushingKinds() []string {
	if p.deps.Providers == nil {
		return nil
	}
	var kinds []string
	for _, kind := range p.deps.Providers.Kinds() {
		if capabilities, ok := p.deps.Providers.Capabilities(kind); ok && capabilities.PushesInvoices {
			kinds = append(kinds, string(kind))
		}
	}
	return kinds
}

// Push runs the push of one invoice from its first step without a result.
// finalize forces the finalization of a draft the provider's settings would
// leave for review (retry-push). A failure is recorded on the invoice and
// returned.
func (p *Pusher) Push(ctx context.Context, invoiceID uuid.UUID, finalize bool) error {
	q := p.deps.Queries(ctx)
	row, err := q.GetInvoiceByID(ctx, invoiceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if charging(row) {
		return p.resumeCharge(ctx, row)
	}
	if !pushable(row) {
		return nil
	}
	conn, err := providers.Connect(ctx, p.deps.Providers, row.OrganizationID, row.ProviderKind)
	if err != nil {
		return p.failed(ctx, row, err)
	}
	if !conn.Adapter.Capabilities().PushesInvoices {
		return p.failed(ctx, row, provider.ErrUnsupported)
	}
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return err
	}

	// Step 0: the provider's customer.
	customerID := deref(row.ExternalCustomerID)
	if customerID == "" {
		customerID, err = p.ensureCustomer(ctx, q, conn, row, now)
		if err != nil {
			return p.failed(ctx, row, err)
		}
		if affected, err := q.SetInvoiceCustomer(ctx, db.SetInvoiceCustomerParams{
			ExternalCustomerID: &customerID, Now: invoices.Timestamp(now), ID: row.ID,
		}); err != nil || affected == 0 {
			return err
		}
	}

	sub, err := q.GetSubscriptionByID(ctx, row.InstanceBillingID)
	if err != nil {
		return err
	}
	defaults, err := settings.Read(ctx, q, row.OrganizationID)
	if err != nil {
		return err
	}
	terms := subscriptions.Terms(sub, defaults)
	normalized, lines, err := providers.Normalize(row, customerID, &terms.DaysUntilDue)
	if err != nil {
		return err
	}
	if err := providers.UnallocatedDiscount(lines); err != nil {
		return p.failed(ctx, row, err)
	}

	// Step 1: the provider's draft.
	externalID := deref(row.ExternalInvoiceID)
	if externalID == "" {
		externalID, err = p.draft(ctx, conn, row, customerID, normalized)
		if err != nil {
			return p.failed(ctx, row, err)
		}
		affected, err := q.SetInvoiceDraft(ctx, db.SetInvoiceDraftParams{ExternalInvoiceID: &externalID, Now: invoices.Timestamp(now), ID: row.ID})
		if err != nil {
			return err
		}
		if affected == 0 {
			p.compensateIfVoided(ctx, conn, row.ID, externalID)
			return nil
		}
	}

	// Step 2a: the discounts.
	stopped, err := p.discounts(ctx, q, conn, row, externalID, normalized, lines, now)
	if err != nil {
		return p.failed(ctx, row, err)
	}
	if stopped {
		return nil
	}
	normalized = bear(normalized, lines)

	// Step 2b: the lines.
	stopped, err = p.lines(ctx, q, conn, row, externalID, normalized, lines, now)
	if err != nil {
		return p.failed(ctx, row, err)
	}
	if stopped {
		return nil
	}

	// Review mode: the draft waits in the provider.
	if !conn.AutoFinalize && !finalize {
		_, err := q.AwaitFinalization(ctx, db.AwaitFinalizationParams{Now: invoices.Timestamp(now), ID: row.ID})
		return err
	}

	// Step 3: finalize.
	callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
	finalized, err := conn.Adapter.Finalize(callCtx, conn.Ref, externalID, normalized)
	cancel()
	if err != nil {
		return p.failed(ctx, row, err)
	}
	pushed, err := Finalized(ctx, p.deps, p.outbox, row, finalized, terms.DaysUntilDue, now)
	if err != nil {
		return err
	}
	if pushed != nil {
		telemetry.Pushed(ctx, string(row.ProviderKind), row.PushAttempts+1)
	}
	if pushed == nil {
		// Voided while it was finalized: the provider's invoice goes too.
		p.compensateIfVoided(ctx, conn, row.ID, externalID)
		return nil
	}

	// Step 4, automatic collection: charge it. Reconciliation reads the
	// invoice after the charge, whatever its outcome.
	if pushed.CollectionMethod == db.CollectionMethodCHARGEAUTOMATICALLY {
		if err := p.charge(ctx, conn, *pushed, normalized); err != nil {
			return err
		}
	}

	// Step 5: read back, reconcile, release the discounts. A failed read
	// leaves both to the next sync pass.
	callCtx, cancel = providers.Bound(ctx, p.cfg.Timeout)
	read, err := conn.Adapter.GetInvoice(callCtx, conn.Ref, externalID)
	cancel()
	if err != nil {
		slog.WarnContext(ctx, "invoice read-back failed; sync reconciles it", "invoice_id", row.ID, "error", err)
		return nil
	}
	return Settle(ctx, p.deps, p.outbox, conn, *pushed, read, p.cfg.Timeout)
}

// charging reports an issued invoice waiting for its automatic charge's
// outcome: claimed again by the push queue until it is known.
func charging(row db.InstanceInvoice) bool {
	return row.ProviderKind != db.BillingProviderKindNOOP && row.Status == db.InvoiceStatusPUSHED &&
		row.CollectionMethod == db.CollectionMethodCHARGEAUTOMATICALLY && row.NextPushAt.Valid
}

// resumeCharge retries the charge of an issued invoice, under the same key:
// Stripe replays the first outcome within 24 hours, and beyond them the
// adapter reads the invoice first and charges only one still open.
func (p *Pusher) resumeCharge(ctx context.Context, row db.InstanceInvoice) error {
	conn, err := providers.Connect(ctx, p.deps.Providers, row.OrganizationID, row.ProviderKind)
	if err != nil {
		return err
	}
	normalized, _, err := providers.Normalize(row, deref(row.ExternalCustomerID), nil)
	if err != nil {
		return err
	}
	if err := p.charge(ctx, conn, row, normalized); err != nil {
		return err
	}
	q := p.deps.Queries(ctx)
	current, err := q.GetInvoiceByID(ctx, row.ID)
	if err != nil || current.ReconciliationStatus != nil {
		return err
	}
	callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
	read, err := conn.Adapter.GetInvoice(callCtx, conn.Ref, deref(row.ExternalInvoiceID))
	cancel()
	if err != nil {
		return nil // the next sync pass reconciles it
	}
	return Settle(ctx, p.deps, p.outbox, conn, current, read, p.cfg.Timeout)
}

func pushable(row db.InstanceInvoice) bool {
	return row.ProviderKind != db.BillingProviderKindNOOP && row.HoldReason == nil &&
		(row.Status == db.InvoiceStatusDRAFT || row.Status == db.InvoiceStatusPUSHFAILED)
}

func (p *Pusher) ensureCustomer(ctx context.Context, q *db.Queries, conn *provider.Connection, row db.InstanceInvoice, now time.Time) (string, error) {
	if row.CustomerID == nil {
		return "", &provider.Error{
			Class: provider.ClassCustomerMissing, Code: "customer_deleted", Param: "", RequestID: "",
			Message: "the invoice's customer was deleted; void and recompose the invoice",
		}
	}
	customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: row.OrganizationID, ID: *row.CustomerID})
	if err != nil {
		return "", err
	}
	email := deref(row.BillingEmail)
	if email == "" {
		email = deref(customer.BillingEmail)
	}
	return providers.EnsureCustomer(ctx, q, conn, row.OrganizationID,
		providers.Customer{ID: customer.ID, Name: customer.Name, Email: email}, p.cfg.Timeout, now)
}

// draft creates the provider's draft, after looking for one an earlier
// attempt created but could not record.
func (p *Pusher) draft(ctx context.Context, conn *provider.Connection, row db.InstanceInvoice, customerID string, normalized provider.NormalizedInvoice) (string, error) {
	if row.PushAttempts > 0 {
		callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
		found, err := conn.Adapter.FindInvoice(callCtx, conn.Ref, customerID, row.ID)
		cancel()
		if err != nil {
			return "", err
		}
		if found != nil {
			return found.ExternalID, nil
		}
	}
	callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
	defer cancel()
	draft, err := conn.Adapter.CreateDraft(callCtx, conn.Ref, normalized)
	if err != nil {
		return "", err
	}
	return draft.ExternalID, nil
}

// discounts creates the provider discount of each allocation of each
// DISCOUNT line not recorded yet, in seq order, each recorded on its line as
// soon as it is created. stopped: the invoice was voided meanwhile.
func (p *Pusher) discounts(ctx context.Context, q *db.Queries, conn *provider.Connection, row db.InstanceInvoice, invoiceID string,
	normalized provider.NormalizedInvoice, lines []rating.InvoiceLine, now time.Time,
) (stopped bool, err error) {
	for i := range lines {
		line := &lines[i]
		if line.Type != rating.LineDiscount || line.Discount == nil {
			continue
		}
		for j, allocation := range line.Discount.Allocations {
			if line.Provider != nil && j < len(line.Provider.CouponIDs) {
				continue
			}
			var discount provider.NormalizedDiscount
			for _, d := range normalized.Discounts {
				if d.Seq == line.Seq && d.TargetSeq == allocation.TargetSeq {
					discount = d
				}
			}
			callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
			id, err := conn.Adapter.AddDiscount(callCtx, conn.Ref, invoiceID, normalized, discount)
			cancel()
			if err != nil {
				return false, err
			}
			if line.Provider == nil {
				line.Provider = &rating.InvoiceLineProvider{ExternalLineID: "", Amount: nil, CouponIDs: nil}
			}
			line.Provider.CouponIDs = append(line.Provider.CouponIDs, id)
			if stopped, err := p.record(ctx, q, conn, row, invoiceID, lines, now); stopped || err != nil {
				return stopped, err
			}
		}
	}
	return false, nil
}

// bear gives each line the provider ids of the discounts it bears, as the
// DISCOUNT lines recorded them.
func bear(normalized provider.NormalizedInvoice, lines []rating.InvoiceLine) provider.NormalizedInvoice {
	ids := map[[2]int]string{} // (DISCOUNT seq, target seq) -> provider id
	for _, line := range lines {
		if line.Type != rating.LineDiscount || line.Discount == nil || line.Provider == nil {
			continue
		}
		for j, allocation := range line.Discount.Allocations {
			if j < len(line.Provider.CouponIDs) {
				ids[[2]int{line.Seq, allocation.TargetSeq}] = line.Provider.CouponIDs[j]
			}
		}
	}
	out := normalized
	out.Lines = make([]provider.NormalizedLine, len(normalized.Lines))
	for i, line := range normalized.Lines {
		out.Lines[i] = line
		out.Lines[i].Discounts = make([]provider.LineDiscount, len(line.Discounts))
		for j, d := range line.Discounts {
			out.Lines[i].Discounts[j] = d
			out.Lines[i].Discounts[j].ExternalID = ids[[2]int{d.Seq, line.Seq}]
		}
	}
	return out
}

// lines adds the lines other than DISCOUNT ones the provider does not have
// yet, in seq order, each recorded as soon as it is added. A line an earlier
// attempt added is adopted when it bears the expected discounts, and
// otherwise removed and added again under a key of its own. stopped: the
// invoice was voided meanwhile.
func (p *Pusher) lines(ctx context.Context, q *db.Queries, conn *provider.Connection, row db.InstanceInvoice, invoiceID string,
	normalized provider.NormalizedInvoice, lines []rating.InvoiceLine, now time.Time,
) (stopped bool, err error) {
	missing := false
	for _, line := range lines {
		if line.Type != rating.LineDiscount && line.Provider == nil {
			missing = true
		}
	}
	if !missing {
		return false, nil
	}
	callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
	read, err := conn.Adapter.GetInvoice(callCtx, conn.Ref, invoiceID)
	cancel()
	if err != nil {
		return false, err
	}
	existing := map[uuid.UUID]provider.Line{}
	for _, line := range read.Lines {
		existing[line.KaitenLineID] = line
	}
	byID := map[uuid.UUID]provider.NormalizedLine{}
	for _, line := range normalized.Lines {
		byID[line.LineID] = line
	}
	for i, line := range lines {
		if line.Type == rating.LineDiscount || line.Provider != nil {
			continue
		}
		want := byID[*line.ID]
		found, ok := existing[*line.ID]
		externalLineID := found.ExternalLineID
		if ok && !bears(found, want) {
			callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
			err := conn.Adapter.DeleteLine(callCtx, conn.Ref, invoiceID, found.ExternalLineID)
			cancel()
			if err != nil {
				return false, err
			}
			ok, want.Recreation = false, max(1, int(row.PushAttempts))
		}
		if !ok {
			callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
			externalLineID, err = conn.Adapter.AddLine(callCtx, conn.Ref, invoiceID, normalized, want)
			cancel()
			if err != nil {
				return false, err
			}
		}
		lines[i].Provider = &rating.InvoiceLineProvider{ExternalLineID: externalLineID, Amount: nil, CouponIDs: nil}
		if stopped, err := p.record(ctx, q, conn, row, invoiceID, lines, now); stopped || err != nil {
			return stopped, err
		}
	}
	return false, nil
}

// bears reports whether a provider line carries exactly the discounts a line
// is pushed with.
func bears(found provider.Line, want provider.NormalizedLine) bool {
	have := make([]string, 0, len(found.Discounts))
	for _, d := range found.Discounts {
		have = append(have, d.ExternalID)
	}
	expected := make([]string, 0, len(want.Discounts))
	for _, d := range want.Discounts {
		expected = append(expected, d.ExternalID)
	}
	slices.Sort(have)
	slices.Sort(expected)
	return slices.Equal(have, expected)
}

// record persists the lines with the provider ids recorded so far. stopped:
// the invoice is no longer pushable, and the run stops (compensating when
// it was voided).
func (p *Pusher) record(ctx context.Context, q *db.Queries, conn *provider.Connection, row db.InstanceInvoice, invoiceID string,
	lines []rating.InvoiceLine, now time.Time,
) (stopped bool, err error) {
	encoded, err := encodeLines(lines)
	if err != nil {
		return false, err
	}
	affected, err := q.SetInvoiceLines(ctx, db.SetInvoiceLinesParams{Lines: encoded, Now: invoices.Timestamp(now), AnyStatus: false, ID: row.ID})
	if err != nil {
		return false, err
	}
	if affected == 0 {
		p.compensateIfVoided(ctx, conn, row.ID, invoiceID)
		return true, nil
	}
	return false, nil
}

// compensateIfVoided compensates a write that found the invoice no longer
// pushable -- but only when that is because the invoice was voided. The same
// lost write also happens when another run of the same invoice got there
// first (a retry-push, a queue pass whose lease lapsed): that run's provider
// invoice is the invoice, and voiding it would void a real one.
func (p *Pusher) compensateIfVoided(ctx context.Context, conn *provider.Connection, invoiceID uuid.UUID, externalID string) {
	current, err := p.deps.Queries(ctx).GetInvoiceByID(ctx, invoiceID)
	if err != nil {
		slog.WarnContext(ctx, "could not tell whether an invoice was voided during its push; leaving the provider's copy",
			"invoice_id", invoiceID, "error", err)
		return
	}
	if current.Status != db.InvoiceStatusVOID {
		slog.WarnContext(ctx, "another run pushed this invoice meanwhile; this run stops", "invoice_id", invoiceID,
			"status", current.Status)
		return
	}
	p.compensate(ctx, conn, current, externalID)
}

// compensate removes from the provider what a run created for an invoice
// voided meanwhile: a draft is deleted, an issued invoice voided, then the
// discounts the run created for it are deleted, best effort.
func (p *Pusher) compensate(ctx context.Context, conn *provider.Connection, current db.InstanceInvoice, externalID string) {
	callCtx, cancel := providers.Bound(ctx, p.cfg.Timeout)
	err := conn.Adapter.VoidInvoice(callCtx, conn.Ref, externalID)
	cancel()
	if err != nil {
		slog.ErrorContext(ctx, "could not remove the provider invoice of a voided invoice", "invoice_id", current.ID,
			"external_invoice_id", externalID, "error", err)
		return
	}
	telemetry.Compensated(ctx, string(current.ProviderKind))
	var lines []rating.InvoiceLine
	if err := json.Unmarshal(current.Lines, &lines); err != nil {
		slog.WarnContext(ctx, "could not read the lines of a voided invoice; its provider discounts stay", "invoice_id", current.ID, "error", err)
		return
	}
	providers.ReleaseDiscounts(ctx, conn, current.ID, lines, p.cfg.Timeout)
}

// failed records a failed step: PUSH_FAILED, tried again after 1, 2, 4...
// minutes up to the configured cap. The failure is announced when the
// attempts reach the alert threshold, then about once a day.
func (p *Pusher) failed(ctx context.Context, row db.InstanceInvoice, cause error) error {
	q := p.deps.Queries(ctx)
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return err
	}
	attempts := int(row.PushAttempts) + 1
	wait := p.backoff(attempts)
	telemetry.InvoicePush(ctx, string(row.ProviderKind), telemetry.PushFailed)
	summary := provider.Summary(cause)
	err = p.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := p.deps.Queries(ctx)
		updated, err := q.MarkPushFailed(ctx, db.MarkPushFailedParams{
			LastPushError: &summary, NextPushAt: invoices.Timestamp(now.Add(wait)), Now: invoices.Timestamp(now), ID: row.ID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if !p.alerts(attempts) {
			return nil
		}
		return invoices.Announce(ctx, p.outbox, row.OrganizationID, events.InstanceInvoicePushFailed, invoices.PushFailedInvoice{
			InvoiceSummary: invoices.Summary(updated), PushAttempts: updated.PushAttempts, LastPushError: summary,
		})
	})
	if err != nil {
		return err
	}
	return fmt.Errorf("push of invoice %s: %w", row.ID, cause)
}

// backoff is the wait before attempt+1: 1, 2, 4... minutes, up to the cap.
func (p *Pusher) backoff(attempts int) time.Duration {
	wait := p.cfg.MaxBackoff
	if attempts < 30 {
		if backoff := time.Duration(1<<(attempts-1)) * time.Minute; backoff < wait {
			wait = backoff
		}
	}
	return wait
}

// alerts reports whether the failure of this attempt is announced: at the
// threshold, then every day's worth of attempts at the backoff cap.
func (p *Pusher) alerts(attempts int) bool {
	if attempts < p.cfg.AlertAfterAttempts {
		return false
	}
	perDay := max(1, int((24*time.Hour)/p.cfg.MaxBackoff))
	return (attempts-p.cfg.AlertAfterAttempts)%perDay == 0
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
