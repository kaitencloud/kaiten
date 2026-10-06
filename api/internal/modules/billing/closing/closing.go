// Package closing closes subscriptions' periods into their invoices: the work
// of the period-close job and of close-periods. Each subscription closes in
// one transaction, one boundary at a time, so a close that fails leaves
// nothing behind and the subscription simply stays due.
package closing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const boundaryConstraint = "instance_invoice_boundary_key"

// invariantOrder ranks the journal invariants: a held invoice's reason is the
// first that failed, in this order.
var invariantOrder = []ports.Invariant{
	ports.InvariantSequenceGap, ports.InvariantChainBreak, ports.InvariantCounterMismatch,
}

// Outcome is what closing one subscription did.
type Outcome struct {
	// Closed is false when the subscription was not closed now: no longer
	// due, held by another transaction, or its meters' clock not at the
	// boundary yet.
	Closed     bool
	Invoice    *ClosedInvoice
	SkipReason string
}

// ClosedInvoice is an invoice a close produced.
type ClosedInvoice struct {
	ID           uuid.UUID `json:"id"`
	InstanceSlug string    `json:"instanceSlug"`
	Kind         string    `json:"kind" enum:"ACTIVATION,RENEWAL,FINAL"`
	BoundaryAt   time.Time `json:"boundaryAt"`
	Status       string    `json:"status" enum:"DRAFT,PUSHED,PUSH_FAILED,MANUAL,PAID,PAYMENT_FAILED,UNCOLLECTIBLE,VOID"`
	Held         bool      `json:"held" doc:"Set when the invoice is a held DRAFT"`
}

// Closer closes due subscriptions.
type Closer struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
	grace  time.Duration
	m      *metrics

	// heldCursor is where the held-invoice re-check stopped, per replica.
	cursorMu   sync.Mutex
	heldCursor *heldCursor
}

func New(deps access.Deps, grace time.Duration) *Closer {
	return &Closer{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof), grace: grace, m: newMetrics()}
}

// CloseOne closes the subscription's current period if it has ended: it
// composes the RENEWAL -- the elapsed period's usage in arrears, the next
// period's base in advance -- holds it when the usage journal fails a check,
// issues it otherwise, and advances the period. actor is recorded as the
// subscription's writer.
func (c *Closer) CloseOne(ctx context.Context, subscriptionID, actor uuid.UUID) (Outcome, error) {
	q := c.deps.Queries(ctx)
	sub, err := q.GetSubscriptionByID(ctx, subscriptionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Outcome{Closed: false, Invoice: nil, SkipReason: "gone"}, nil
	}
	if err != nil {
		return Outcome{}, err
	}
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return Outcome{}, err
	}
	if !c.due(sub, clock.Time.UTC()) {
		return Outcome{Closed: false, Invoice: nil, SkipReason: "not due"}, nil
	}
	if sub.CancelAtPeriodEnd {
		return Outcome{}, fmt.Errorf("subscription %s is set to cancel at period end, which this release cannot close", sub.ID)
	}
	boundary := sub.CurrentPeriodEnd.Time.UTC()

	// Every report dated before the boundary must have committed before the
	// period is measured: seal each metered pair first, outside the
	// transaction, as the usage report takes the same lock.
	base, err := c.deps.Catalogue.Price(ctx, sub.OrganizationID, sub.BaseLicensePriceID)
	if err != nil {
		return Outcome{}, err
	}
	if base == nil {
		return Outcome{}, fmt.Errorf("subscription %s is pinned to price %s, which does not exist", sub.ID, sub.BaseLicensePriceID)
	}
	metered, err := c.deps.Catalogue.MeteredPrices(ctx, sub.OrganizationID, base.LicenseID)
	if err != nil {
		return Outcome{}, err
	}
	if sub.InstanceID != nil {
		for _, price := range metered {
			ref := ports.UsageRef{OrganizationID: sub.OrganizationID, InstanceID: *sub.InstanceID, EntitlementID: *price.EntitlementID}
			if _, err := c.deps.Usage.Seal(ctx, ref, boundary); errors.Is(err, ports.ErrClockBehind) {
				return Outcome{Closed: false, Invoice: nil, SkipReason: "clock behind"}, nil
			} else if err != nil {
				return Outcome{}, err
			}
		}
	}

	var outcome Outcome
	err = c.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		var err error
		outcome, err = c.closeLocked(ctx, subscriptionID, boundary, actor)
		return err
	})
	if kaitenerrors.IsUniqueViolationOnConstraint(err, boundaryConstraint) {
		// Another close issued this boundary's invoice between our read and
		// our insert; the period it advanced is no longer due.
		slog.InfoContext(ctx, "billing period close lost the race for a boundary, nothing issued",
			"instance_billing_id", subscriptionID, "boundary_at", boundary)
		add(ctx, c.m.duplicates, 1)
		return Outcome{Closed: false, Invoice: nil, SkipReason: "closed concurrently"}, nil
	}
	if err != nil {
		return Outcome{}, err
	}
	return outcome, nil
}

func (c *Closer) closeLocked(ctx context.Context, subscriptionID uuid.UUID, boundary time.Time, actor uuid.UUID) (Outcome, error) {
	q := c.deps.Queries(ctx)
	sub, err := q.LockDueSubscription(ctx, subscriptionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Outcome{Closed: false, Invoice: nil, SkipReason: "locked"}, nil
	}
	if err != nil {
		return Outcome{}, err
	}
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return Outcome{}, err
	}
	now := clock.Time.UTC()
	if !c.due(sub, now) || !sub.CurrentPeriodEnd.Time.UTC().Equal(boundary) {
		return Outcome{Closed: false, Invoice: nil, SkipReason: "not due"}, nil
	}

	// The identity on the invoice is the live one (§5.7), not subscribe time's.
	if sub, err = q.RefreshSubscriptionSnapshot(ctx, sub.ID); err != nil {
		return Outcome{}, err
	}

	base, err := c.deps.Catalogue.Price(ctx, sub.OrganizationID, sub.BaseLicensePriceID)
	if err != nil {
		return Outcome{}, err
	}
	if base == nil {
		return Outcome{}, fmt.Errorf("subscription %s is pinned to price %s, which does not exist", sub.ID, sub.BaseLicensePriceID)
	}
	var billingEmail *string
	if sub.CustomerID != nil {
		customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: sub.OrganizationID, ID: *sub.CustomerID})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Outcome{}, err
		}
		billingEmail = customer.BillingEmail
	}

	composition, hold, next, err := c.compose(ctx, q, sub, base, boundary, boundary)
	if err != nil {
		return Outcome{}, err
	}

	defaults, err := settings.Read(ctx, q, sub.OrganizationID)
	if err != nil {
		return Outcome{}, err
	}
	row, err := invoices.Insert(ctx, q, invoices.Draft{
		Subscription: sub, LicenseID: base.LicenseID, LicenseSlug: base.LicenseSlug, BillingEmail: billingEmail,
		Kind: rating.KindRenewal, BoundaryAt: boundary, Composition: composition,
		Terms: subscriptions.Terms(sub, defaults), Hold: hold, ReplacesInvoiceID: nil, Now: now,
	})
	if err != nil {
		return Outcome{}, err
	}
	if err := invoices.AnnounceComposed(ctx, c.outbox, row); err != nil {
		return Outcome{}, err
	}
	if err := q.AdvanceSubscriptionPeriod(ctx, db.AdvanceSubscriptionPeriodParams{
		PeriodStart: invoices.Timestamp(boundary), PeriodEnd: invoices.Timestamp(next),
		UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
	}); err != nil {
		return Outcome{}, err
	}
	return Outcome{
		Closed: true,
		Invoice: &ClosedInvoice{
			ID: row.ID, InstanceSlug: row.InstanceSlug, Kind: string(row.Kind), BoundaryAt: boundary,
			Status: string(row.Status), Held: row.HoldReason != nil,
		},
		SkipReason: "",
	}, nil
}

// compose rates the subscription's period ending at boundary: its usage up
// to measuredTo in arrears, from the later of the period's start and the
// instant billing went live, and the next period's base in advance. It
// returns the composition, the hold its journal calls for, and the next
// boundary.
func (c *Closer) compose(ctx context.Context, q *db.Queries, sub db.InstanceBilling, base *ports.CataloguePrice, boundary, measuredTo time.Time) (rating.Composition, *invoices.Hold, time.Time, error) {
	periodStart := sub.CurrentPeriodStart.Time.UTC()
	if started := sub.StartedAt.Time.UTC(); started.After(periodStart) {
		periodStart = started
	}
	until := boundary
	if measuredTo.Before(boundary) {
		until = measuredTo
	}
	if until.Before(periodStart) {
		until = periodStart
	}
	months := rating.PeriodMonths(string(sub.BillingPeriod))
	next := NextBoundary(sub.AnchorAt.Time.UTC(), boundary, months)

	meteredPrices, err := c.deps.Catalogue.MeteredPrices(ctx, sub.OrganizationID, base.LicenseID)
	if err != nil {
		return rating.Composition{}, nil, time.Time{}, err
	}
	measures, hold, err := c.measure(ctx, q, sub, meteredPrices, periodStart, until)
	if err != nil {
		return rating.Composition{}, nil, time.Time{}, err
	}
	ratedMetered := make([]rating.Price, len(meteredPrices))
	for i, price := range meteredPrices {
		ratedMetered[i] = metering.Price(price)
	}
	composition, err := rating.Compose(rating.Input{
		Kind: rating.KindRenewal, Currency: money.Currency(sub.Currency), LicenseName: base.LicenseName,
		Base: metering.Price(*base), Metered: ratedMetered, Measures: measures,
		Advance: rating.Period{From: boundary, To: next}, Arrears: rating.Period{From: periodStart, To: boundary},
	})
	if errors.Is(err, rating.ErrAmountOverflow) {
		return rating.Composition{}, nil, time.Time{}, kaitenerrors.Internal("ComposeInvoice.AmountOverflow", "an invoice amount overflows 64-bit minor units")
	}
	if err != nil {
		return rating.Composition{}, nil, time.Time{}, err
	}
	return composition, hold, next, nil
}

// Preview composes, without sealing or writing anything, the invoice the
// subscription's next boundary would issue on its usage so far, and says
// which meters' journals would hold it.
func (c *Closer) Preview(ctx context.Context, sub db.InstanceBilling) (*rating.InvoicePreview, error) {
	q := c.deps.Queries(ctx)
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	now := clock.Time.UTC()
	base, err := c.deps.Catalogue.Price(ctx, sub.OrganizationID, sub.BaseLicensePriceID)
	if err != nil {
		return nil, err
	}
	if base == nil {
		return nil, fmt.Errorf("subscription %s is pinned to price %s, which does not exist", sub.ID, sub.BaseLicensePriceID)
	}
	boundary := sub.CurrentPeriodEnd.Time.UTC()
	composition, hold, _, err := c.compose(ctx, q, sub, base, boundary, now)
	if err != nil {
		return nil, err
	}
	preview := rating.Preview(rating.KindRenewal, now, boundary, base.LicenseSlug, sub.Currency, composition)
	if hold != nil {
		for _, pair := range hold.Detail.Pairs {
			preview.WouldHold = append(preview.WouldHold, rating.InvoiceHold{EntitlementID: pair.EntitlementID, Invariant: string(pair.Invariant)})
		}
	}
	return &preview, nil
}

// measure summarizes every metered pair over [from, to) and checks its
// journal; a failure anywhere holds the invoice.
func (c *Closer) measure(ctx context.Context, q *db.Queries, sub db.InstanceBilling, metered []ports.CataloguePrice, from, to time.Time) (map[uuid.UUID]rating.Measure, *invoices.Hold, error) {
	measures := map[uuid.UUID]rating.Measure{}
	if sub.InstanceID == nil {
		return measures, nil, nil
	}
	previous, err := previousLedgers(ctx, q, sub.ID, to)
	if err != nil {
		return nil, nil, err
	}

	var held []invoices.HeldPair
	for _, price := range metered {
		ref := ports.UsageRef{OrganizationID: sub.OrganizationID, InstanceID: *sub.InstanceID, EntitlementID: *price.EntitlementID}
		summary, err := c.deps.Usage.Summarize(ctx, ref, from, to)
		if err != nil {
			return nil, nil, err
		}
		measure := metering.Measure(summary)
		instanceID := ref.InstanceID
		measure.Ledger.InstanceID = &instanceID
		measures[ref.EntitlementID] = measure
		failures, err := c.deps.Usage.CheckInvariants(ctx, ref, from, to, previous[ref.EntitlementID])
		if err != nil {
			return nil, nil, err
		}
		for _, failure := range failures {
			held = append(held, invoices.HeldPair{InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID, InvariantFailure: failure})
		}
	}
	if len(held) == 0 {
		return measures, nil, nil
	}
	reason := held[0].Invariant
	for _, pair := range held {
		if slices.Index(invariantOrder, pair.Invariant) < slices.Index(invariantOrder, reason) {
			reason = pair.Invariant
		}
	}
	return measures, &invoices.Hold{Reason: string(reason), Detail: invoices.HoldDetail{Pairs: held}}, nil
}

// previousLedgers reads, per metered entitlement, the fingerprint the
// subscription's previous invoice carries: the next period must start right
// after its last report.
func previousLedgers(ctx context.Context, q *db.Queries, subscriptionID uuid.UUID, boundary time.Time) (map[uuid.UUID]*ports.Fingerprint, error) {
	out := map[uuid.UUID]*ports.Fingerprint{}
	encoded, err := q.GetPreviousInvoiceLines(ctx, db.GetPreviousInvoiceLinesParams{
		InstanceBillingID: subscriptionID, BoundaryAt: invoices.Timestamp(boundary),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	var lines []rating.InvoiceLine
	if err := json.Unmarshal(encoded, &lines); err != nil {
		return nil, fmt.Errorf("decode the previous invoice's lines: %w", err)
	}
	for _, line := range lines {
		if line.EntitlementID == nil || line.Metering == nil || line.Metering.Ledger == nil || line.Metering.Ledger.LastSeq == nil {
			continue
		}
		last := *line.Metering.Ledger.LastSeq
		out[*line.EntitlementID] = &ports.Fingerprint{
			FirstSeq: line.Metering.Ledger.FirstSeq, LastSeq: &last, Rows: line.Metering.Ledger.Rows,
		}
	}
	return out, nil
}

func (c *Closer) due(sub db.InstanceBilling, now time.Time) bool {
	return subscriptions.Live(sub.Status) && !sub.CurrentPeriodEnd.Time.UTC().After(now.Add(-c.grace))
}

// NextBoundary is the end of the period that starts at boundary: counted from
// the anchor, so a period clamped to a short month does not drift. An anchor
// on 01-31 gives 02-28, then 03-31, never 03-28.
func NextBoundary(anchor, boundary time.Time, months int) time.Time {
	elapsed := (boundary.Year()-anchor.Year())*12 + int(boundary.Month()-anchor.Month())
	if rating.AddMonthsClamped(anchor, elapsed).Equal(boundary) {
		return rating.AddMonthsClamped(anchor, elapsed+months)
	}
	return rating.AddMonthsClamped(boundary, months)
}
