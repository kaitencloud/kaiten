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
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
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
}

func New(deps access.Deps, grace time.Duration) *Closer {
	return &Closer{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof), grace: grace}
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
	boundary := sub.CurrentPeriodEnd.Time.UTC()

	// Every report dated before the boundary must have committed before the
	// period is measured: seal each metered pair first, outside the
	// transaction, as the usage report takes the same lock. A trial ending
	// bills no usage.
	if sub.Status != db.InstanceBillingStatusTRIAL {
		if outcome, err := c.seal(ctx, sub, boundary); err != nil || outcome != nil {
			if outcome != nil {
				return *outcome, nil
			}
			return Outcome{}, err
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
		return Outcome{Closed: false, Invoice: nil, SkipReason: "closed concurrently"}, nil
	}
	if err != nil {
		return Outcome{}, err
	}
	return outcome, nil
}

// seal seals every metered pair of the subscription's base version at
// through; a deferral when the clock has not reached it.
func (c *Closer) seal(ctx context.Context, sub db.InstanceBilling, through time.Time) (*Outcome, error) {
	if sub.InstanceID == nil {
		return nil, nil
	}
	base, err := c.basePrice(ctx, sub)
	if err != nil {
		return nil, err
	}
	metered, err := c.deps.Catalogue.MeteredPrices(ctx, sub.OrganizationID, base.LicenseID)
	if err != nil {
		return nil, err
	}
	for _, price := range metered {
		ref := ports.UsageRef{OrganizationID: sub.OrganizationID, InstanceID: *sub.InstanceID, EntitlementID: *price.EntitlementID}
		if _, err := c.deps.Usage.Seal(ctx, ref, through); errors.Is(err, ports.ErrClockBehind) {
			return &Outcome{Closed: false, Invoice: nil, SkipReason: "clock behind"}, nil
		} else if err != nil {
			return nil, err
		}
	}
	return nil, nil
}

// Seal seals the subscription's metered pairs at through, outside any
// transaction: what an immediate cancellation does before it bills.
func (c *Closer) Seal(ctx context.Context, sub db.InstanceBilling, through time.Time) error {
	outcome, err := c.seal(ctx, sub, through)
	if err == nil && outcome != nil {
		return ports.ErrClockBehind
	}
	return err
}

func (c *Closer) basePrice(ctx context.Context, sub db.InstanceBilling) (*ports.CataloguePrice, error) {
	base, err := c.deps.Catalogue.Price(ctx, sub.OrganizationID, sub.BaseLicensePriceID)
	if err != nil {
		return nil, err
	}
	if base == nil {
		return nil, fmt.Errorf("subscription %s is pinned to price %s, which does not exist", sub.ID, sub.BaseLicensePriceID)
	}
	return base, nil
}

// closeLocked closes the locked subscription's boundary by its state:
//   - a TRIAL ending converts to ACTIVE, anchored at the trial's end, and
//     issues the ACTIVATION invoice;
//   - a period ending with a cancellation scheduled issues the FINAL invoice
//     (arrears only) and cancels;
//   - otherwise the RENEWAL bills the elapsed period's arrears and the next
//     period's advance, applying a scheduled plan change at the boundary.
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
	base, err := c.basePrice(ctx, sub)
	if err != nil {
		return Outcome{}, err
	}
	plan, err := c.planFor(ctx, sub, base, boundary)
	if err != nil {
		return Outcome{}, err
	}
	composition, hold, err := c.compose(ctx, q, sub, plan, boundary, boundary)
	if err != nil {
		return Outcome{}, err
	}

	var billingEmail *string
	if sub.CustomerID != nil {
		customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: sub.OrganizationID, ID: *sub.CustomerID})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Outcome{}, err
		}
		billingEmail = customer.BillingEmail
	}
	terms, err := c.Terms(ctx, q, sub)
	if err != nil {
		return Outcome{}, err
	}
	// The invoice is filed under the version it billed arrears for, or the
	// version it starts when it bills none.
	filedUnder := base
	if plan.kind == rating.KindActivation {
		filedUnder = plan.advanceBase
	}
	var row *db.InstanceInvoice
	// A RENEWAL and a FINAL are issued even without a line: the row is the
	// boundary's record. An all-arrears subscription has no ACTIVATION.
	if plan.kind != rating.KindActivation || len(composition.Lines) > 0 {
		inserted, err := invoices.Insert(ctx, q, invoices.Draft{
			Subscription: sub, LicenseID: filedUnder.LicenseID, LicenseSlug: filedUnder.LicenseSlug, BillingEmail: billingEmail,
			Kind: plan.kind, BoundaryAt: boundary, Composition: composition,
			Terms: terms, Hold: hold, ReplacesInvoiceID: nil, Pushes: c.deps.Pushes(sub.ProviderKind), Now: now,
		})
		if err != nil {
			return Outcome{}, err
		}
		if err := invoices.AnnounceComposed(ctx, c.outbox, inserted); err != nil {
			return Outcome{}, err
		}
		if err := metering.Consume(ctx, c.deps.Discounts, sub.OrganizationID, composition, now); err != nil {
			return Outcome{}, err
		}
		row = &inserted
	}

	if err := c.transition(ctx, q, sub, plan, boundary, row, actor, now); err != nil {
		return Outcome{}, err
	}
	outcome := Outcome{Closed: true, Invoice: nil, SkipReason: ""}
	if row != nil {
		outcome.Invoice = &ClosedInvoice{
			ID: row.ID, InstanceSlug: row.InstanceSlug, Kind: string(row.Kind), BoundaryAt: boundary,
			Status: string(row.Status), Held: row.HoldReason != nil,
		}
	}
	return outcome, nil
}

// plan is what a boundary bills: which base's metered prices and arrears
// base bill the period that ends, which base bills the one that starts in
// advance, and when that one ends.
type plan struct {
	kind        rating.Kind
	arrearsBase *ports.CataloguePrice
	advanceBase *ports.CataloguePrice
	next        time.Time
	changing    bool
}

func (c *Closer) planFor(ctx context.Context, sub db.InstanceBilling, base *ports.CataloguePrice, boundary time.Time) (plan, error) {
	months := rating.PeriodMonths(string(sub.BillingPeriod))
	switch {
	case sub.Status == db.InstanceBillingStatusTRIAL:
		return plan{
			kind: rating.KindActivation, arrearsBase: nil, advanceBase: base,
			next: rating.AddMonthsClamped(boundary, months), changing: false,
		}, nil
	case sub.CancelAtPeriodEnd:
		return plan{kind: rating.KindFinal, arrearsBase: base, advanceBase: nil, next: boundary, changing: false}, nil
	case sub.ScheduledLicensePriceID != nil:
		target, err := c.deps.Catalogue.Price(ctx, sub.OrganizationID, *sub.ScheduledLicensePriceID)
		if err != nil {
			return plan{}, err
		}
		if target == nil {
			return plan{}, fmt.Errorf("subscription %s is scheduled to price %s, which does not exist", sub.ID, *sub.ScheduledLicensePriceID)
		}
		return plan{
			kind: rating.KindRenewal, arrearsBase: base, advanceBase: target,
			next: rating.AddMonthsClamped(boundary, rating.PeriodMonths(*target.BillingPeriod)), changing: true,
		}, nil
	default:
		return plan{
			kind: rating.KindRenewal, arrearsBase: base, advanceBase: base,
			next: NextBoundary(sub.AnchorAt.Time.UTC(), boundary, months), changing: false,
		}, nil
	}
}

// transition moves the subscription past the boundary its invoice billed.
func (c *Closer) transition(ctx context.Context, q *db.Queries, sub db.InstanceBilling, p plan, boundary time.Time,
	invoice *db.InstanceInvoice, actor uuid.UUID, now time.Time,
) error {
	var invoiceID *uuid.UUID
	if invoice != nil {
		invoiceID = &invoice.ID
	}
	switch {
	case p.kind == rating.KindActivation:
		converted, err := q.ConvertTrial(ctx, db.ConvertTrialParams{
			AnchorAt: invoices.Timestamp(boundary), PeriodEnd: invoices.Timestamp(p.next),
			UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
		})
		if err != nil {
			return err
		}
		return c.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			sub.OrganizationID, events.InstanceBillingStatusChanged.Name, events.InstanceBillingStatusChanged.Type,
			subscriptions.StatusChange{
				InstanceBillingID: converted.ID, InstanceSlug: converted.InstanceSlug,
				From: string(sub.Status), To: string(converted.Status), Reason: "TRIAL_ENDED",
			}, nil))
	case p.kind == rating.KindFinal:
		canceled, err := q.CancelSubscription(ctx, db.CancelSubscriptionParams{
			CanceledAt: invoices.Timestamp(boundary), Reason: nil, UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
		})
		if err != nil {
			return err
		}
		return lifecycle.AnnounceCanceled(ctx, q, c.outbox, c.deps.Catalogue, canceled, "AT_PERIOD_END", invoiceID)
	case p.changing:
		if sub.InstanceID != nil {
			if err := q.AllowPlanChange(ctx); err != nil {
				return err
			}
			if err := q.MoveInstanceToLicense(ctx, db.MoveInstanceToLicenseParams{
				LicenseID: p.advanceBase.LicenseID, Now: invoices.Timestamp(now), ID: *sub.InstanceID,
			}); err != nil {
				return err
			}
		}
		if _, err := q.ApplyPlanChange(ctx, db.ApplyPlanChangeParams{
			BillingPeriod: db.BillingPeriod(*p.advanceBase.BillingPeriod), Currency: p.advanceBase.Currency,
			AnchorAt: invoices.Timestamp(boundary), PeriodEnd: invoices.Timestamp(p.next),
			UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
		}); err != nil {
			return err
		}
		change := subscriptions.PlanChange{
			InstanceSlug: sub.InstanceSlug, FromLicenseSlug: p.arrearsBase.LicenseSlug, ToLicenseSlug: p.advanceBase.LicenseSlug,
			FromPriceID: p.arrearsBase.ID, ToPriceID: p.advanceBase.ID,
		}
		if invoiceID != nil {
			change.InvoiceID = *invoiceID
		}
		return c.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			sub.OrganizationID, events.InstanceBillingPlanChanged.Name, events.InstanceBillingPlanChanged.Type, change, nil))
	default:
		return q.AdvanceSubscriptionPeriod(ctx, db.AdvanceSubscriptionPeriodParams{
			PeriodStart: invoices.Timestamp(boundary), PeriodEnd: invoices.Timestamp(p.next),
			UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
		})
	}
}

// compose rates the boundary a plan describes: the elapsed period's usage up
// to measuredTo and its arrears base, from the later of the period's start
// and the instant billing went live; then the next period's base in advance.
func (c *Closer) compose(ctx context.Context, q *db.Queries, sub db.InstanceBilling, p plan, boundary, measuredTo time.Time) (rating.Composition, *invoices.Hold, error) {
	var lines []rating.InvoiceLine
	var hold *invoices.Hold
	if p.arrearsBase != nil {
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
		meteredPrices, err := c.deps.Catalogue.MeteredPrices(ctx, sub.OrganizationID, p.arrearsBase.LicenseID)
		if err != nil {
			return rating.Composition{}, nil, err
		}
		var measures map[uuid.UUID]rating.Measure
		measures, hold, err = c.measure(ctx, q, sub, meteredPrices, periodStart, until)
		if err != nil {
			return rating.Composition{}, nil, err
		}
		rated := make([]rating.Price, len(meteredPrices))
		for i, price := range meteredPrices {
			rated[i] = metering.Price(price)
		}
		held, err := c.addons(ctx, sub, string(sub.BillingPeriod))
		if err != nil {
			return rating.Composition{}, nil, err
		}
		arrears, err := rating.Compose(rating.Input{
			Kind: rating.KindFinal, Currency: money.Currency(sub.Currency), LicenseName: p.arrearsBase.LicenseName,
			Base: metering.Price(*p.arrearsBase), Metered: rated, Measures: measures, Addons: held,
			Advance: rating.Period{From: boundary, To: boundary}, Arrears: rating.Period{From: periodStart, To: boundary},
		})
		if err != nil {
			return rating.Composition{}, nil, overflow(err)
		}
		lines = append(lines, arrears.Lines...)
	}
	if p.advanceBase != nil {
		period := string(sub.BillingPeriod)
		if p.advanceBase.BillingPeriod != nil {
			period = *p.advanceBase.BillingPeriod
		}
		held, err := c.addons(ctx, sub, period)
		if err != nil {
			return rating.Composition{}, nil, err
		}
		advance, err := rating.Compose(rating.Input{
			Kind: rating.KindActivation, Currency: money.Currency(p.advanceBase.Currency), LicenseName: p.advanceBase.LicenseName,
			Base: metering.Price(*p.advanceBase), Metered: nil, Measures: nil, Addons: held,
			Advance: rating.Period{From: boundary, To: p.next}, Arrears: rating.Period{From: boundary, To: boundary},
		})
		if err != nil {
			return rating.Composition{}, nil, overflow(err)
		}
		lines = append(lines, advance.Lines...)
	}
	composition, err := rating.Assemble(lines)
	if err != nil {
		return rating.Composition{}, nil, overflow(err)
	}
	discounts, err := c.discounts(ctx, sub, boundary)
	if err != nil {
		return rating.Composition{}, nil, err
	}
	composition, err = rating.ApplyDiscounts(composition, discounts, money.Currency(sub.Currency))
	if err != nil {
		return rating.Composition{}, nil, overflow(err)
	}
	return composition, hold, nil
}

// discounts reads the PRICE vouchers that may apply to the invoice of a
// boundary: redeemed by then.
func (c *Closer) discounts(ctx context.Context, sub db.InstanceBilling, boundary time.Time) ([]rating.Discount, error) {
	if sub.InstanceID == nil || c.deps.Discounts == nil {
		return nil, nil
	}
	redeemed, err := c.deps.Discounts.Discounts(ctx, sub.OrganizationID, *sub.InstanceID, boundary)
	if err != nil {
		return nil, err
	}
	return metering.Discounts(redeemed), nil
}

func overflow(err error) error {
	if errors.Is(err, rating.ErrAmountOverflow) {
		return kaitenerrors.Internal("ComposeInvoice.AmountOverflow", "an invoice amount overflows 64-bit minor units")
	}
	return err
}

// addons reads the add-ons the subscription's instance holds, priced for a
// period; none once the instance is deleted.
func (c *Closer) addons(ctx context.Context, sub db.InstanceBilling, period string) ([]rating.AddonCharge, error) {
	if sub.InstanceID == nil || c.deps.Addons == nil {
		return nil, nil
	}
	held, err := c.deps.Addons.BillableAddons(ctx, sub.OrganizationID, *sub.InstanceID, period)
	if err != nil {
		return nil, err
	}
	return metering.Addons(held, sub.Currency), nil
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
	base, err := c.basePrice(ctx, sub)
	if err != nil {
		return nil, err
	}
	boundary := sub.CurrentPeriodEnd.Time.UTC()
	p, err := c.planFor(ctx, sub, base, boundary)
	if err != nil {
		return nil, err
	}
	composition, hold, err := c.compose(ctx, q, sub, p, boundary, now)
	if err != nil {
		return nil, err
	}
	slug := base.LicenseSlug
	if p.kind == rating.KindActivation {
		slug = p.advanceBase.LicenseSlug
	}
	preview := rating.Preview(p.kind, now, boundary, slug, sub.Currency, composition)
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

// Finalize cancels the locked subscription at once, at the instant at, after
// issuing its FINAL invoice: the arrears of [P0, at), the base billed in full
// when it bills in arrears, nothing refunded of a base paid in advance. The
// subscription's metered pairs must have been sealed at at.
func (c *Closer) Finalize(ctx context.Context, q *db.Queries, sub db.InstanceBilling, at time.Time, reason *string, actor uuid.UUID, now time.Time) (*db.InstanceInvoice, db.InstanceBilling, error) {
	base, err := c.basePrice(ctx, sub)
	if err != nil {
		return nil, db.InstanceBilling{}, err
	}
	p := plan{kind: rating.KindFinal, arrearsBase: base, advanceBase: nil, next: at, changing: false}
	composition, hold, err := c.compose(ctx, q, sub, p, at, at)
	if err != nil {
		return nil, db.InstanceBilling{}, err
	}
	var billingEmail *string
	if sub.CustomerID != nil {
		customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: sub.OrganizationID, ID: *sub.CustomerID})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, db.InstanceBilling{}, err
		}
		billingEmail = customer.BillingEmail
	}
	terms, err := c.Terms(ctx, q, sub)
	if err != nil {
		return nil, db.InstanceBilling{}, err
	}
	invoice, err := invoices.Insert(ctx, q, invoices.Draft{
		Subscription: sub, LicenseID: base.LicenseID, LicenseSlug: base.LicenseSlug, BillingEmail: billingEmail,
		Kind: rating.KindFinal, BoundaryAt: at, Composition: composition, Terms: terms, Hold: hold,
		ReplacesInvoiceID: nil, Pushes: c.deps.Pushes(sub.ProviderKind), Now: now,
	})
	if err != nil {
		return nil, db.InstanceBilling{}, err
	}
	if err := invoices.AnnounceComposed(ctx, c.outbox, invoice); err != nil {
		return nil, db.InstanceBilling{}, err
	}
	if err := metering.Consume(ctx, c.deps.Discounts, sub.OrganizationID, composition, now); err != nil {
		return nil, db.InstanceBilling{}, err
	}
	canceled, err := q.CancelSubscription(ctx, db.CancelSubscriptionParams{
		CanceledAt: invoices.Timestamp(at), Reason: reason, UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
	})
	if err != nil {
		return nil, db.InstanceBilling{}, err
	}
	return &invoice, canceled, nil
}
