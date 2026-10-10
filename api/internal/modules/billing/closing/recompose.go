package closing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
)

// AutoReleaseReason is what a held invoice's release says when a later check
// found its journal sound.
const AutoReleaseReason = "auto: invariants pass"

// Recomposition is an invoice composed again from what it was sold and what
// the journal says now: its BASE lines kept as they were, its metered lines
// measured again.
type Recomposition struct {
	Composition rating.Composition
	Hold        *invoices.Hold
}

// Recompose composes row again. keepIDs keeps the kept lines' identifiers,
// for an invoice rewritten in place.
//
// operation names a user's recompose, refused when it would read the journal
// from before the usage history (§8.8); "" is the system's re-check of held
// invoices, which never is.
func (c *Closer) Recompose(ctx context.Context, q *db.Queries, sub db.InstanceBilling, row db.InstanceInvoice, keepIDs bool, operation string) (Recomposition, error) {
	var lines []rating.InvoiceLine
	if err := json.Unmarshal(row.Lines, &lines); err != nil {
		return Recomposition{}, fmt.Errorf("decode lines of invoice %s: %w", row.ID, err)
	}
	boundary := row.BoundaryAt.Time.UTC()
	kind := rating.Kind(row.Kind)

	var kept []rating.InvoiceLine
	var arrearsStart *time.Time
	for _, line := range lines {
		if line.ServiceTo.Equal(boundary) && !line.ServiceFrom.After(boundary) {
			from := line.ServiceFrom
			arrearsStart = &from
		}
		if line.Type == rating.LineUsage || line.Type == rating.LineOverage || line.Type == rating.LineDiscount {
			continue
		}
		if !keepIDs {
			line.ID = nil
		}
		kept = append(kept, line)
	}
	discounts := reapplied(lines)
	if kind == rating.KindActivation {
		composition, err := rating.Assemble(kept)
		if err != nil {
			return Recomposition{}, err
		}
		composition, err = rating.ApplyDiscounts(composition, discounts, money.Currency(row.Currency))
		return Recomposition{Composition: composition, Hold: nil}, err
	}

	from := c.arrearsStart(sub, boundary, arrearsStart)
	metered, err := c.deps.Catalogue.MeteredPrices(ctx, sub.OrganizationID, row.LicenseID)
	if err != nil {
		return Recomposition{}, err
	}
	if len(metered) > 0 && operation != "" {
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return Recomposition{}, err
		}
		if err := c.refuseOutsideRetention(ctx, operation, sub.OrganizationID, from, clock.Time.UTC()); err != nil {
			return Recomposition{}, err
		}
	}
	measures, hold, err := c.measure(ctx, q, sub, metered, from, boundary)
	if err != nil {
		return Recomposition{}, err
	}
	rated := make([]rating.Price, len(metered))
	for i, price := range metered {
		rated[i] = metering.Price(price)
	}
	meteredLines, err := rating.MeteredLines(rating.Input{
		Kind: kind, Currency: money.Currency(row.Currency), LicenseName: "", Base: rating.Price{},
		Metered: rated, Measures: measures,
		Advance: rating.Period{From: boundary, To: boundary}, Arrears: rating.Period{From: from, To: boundary},
	})
	if err != nil {
		return Recomposition{}, err
	}
	composition, err := rating.Assemble(append(kept, meteredLines...))
	if err != nil {
		return Recomposition{}, err
	}
	composition, err = rating.ApplyDiscounts(composition, discounts, money.Currency(row.Currency))
	if err != nil {
		return Recomposition{}, err
	}
	return Recomposition{Composition: composition, Hold: hold}, nil
}

// reapplied are the discounts an invoice's DISCOUNT lines applied, to apply
// again with the same parameters and application numbers: a recomposed
// invoice consumes no new application. A SELECTED_PRICES discount targets
// the prices its lines targeted.
func reapplied(lines []rating.InvoiceLine) []rating.Discount {
	bySeq := map[int]rating.InvoiceLine{}
	for _, line := range lines {
		bySeq[line.Seq] = line
	}
	var out []rating.Discount
	for _, line := range lines {
		if line.Type != rating.LineDiscount || line.Discount == nil || line.VoucherID == nil || line.InstanceVoucherID == nil {
			continue
		}
		d := line.Discount
		value, err := decimal.NewFromString(d.DiscountValue)
		if err != nil {
			continue
		}
		name, _, _ := strings.Cut(line.Label, " −")
		discount := rating.Discount{
			InstanceVoucherID: *line.InstanceVoucherID, VoucherID: *line.VoucherID, Name: name, Type: d.DiscountType,
			Value: value, Currency: "", AppliesTo: d.AppliesTo, LicensePriceIDs: nil, AddonPriceIDs: nil,
			Applications: d.Application - 1, ApplicationsMax: d.ApplicationsMax,
		}
		if d.Currency != nil {
			discount.Currency = *d.Currency
		}
		for _, seq := range d.TargetSeqs {
			target := bySeq[seq]
			if target.LicensePriceID != nil {
				discount.LicensePriceIDs = append(discount.LicensePriceIDs, *target.LicensePriceID)
			}
			if target.AddonPriceID != nil {
				discount.AddonPriceIDs = append(discount.AddonPriceIDs, *target.AddonPriceID)
			}
		}
		out = append(out, discount)
	}
	return out
}

// arrearsStart is where the period an invoice billed in arrears started: as
// its lines say when they billed one, else counted back from the anchor.
func (c *Closer) arrearsStart(sub db.InstanceBilling, boundary time.Time, fromLines *time.Time) time.Time {
	if fromLines != nil {
		return *fromLines
	}
	months := rating.PeriodMonths(string(sub.BillingPeriod))
	start := PreviousBoundary(sub.AnchorAt.Time.UTC(), boundary, months)
	if started := sub.StartedAt.Time.UTC(); started.After(start) && started.Before(boundary) {
		start = started
	}
	return start
}

// PreviousBoundary is the start of the period that ends at boundary, counted
// from the anchor.
func PreviousBoundary(anchor, boundary time.Time, months int) time.Time {
	elapsed := (boundary.Year()-anchor.Year())*12 + int(boundary.Month()-anchor.Month())
	if rating.AddMonthsClamped(anchor, elapsed).Equal(boundary) {
		return rating.AddMonthsClamped(anchor, elapsed-months)
	}
	return rating.AddMonthsClamped(boundary, -months)
}

// Terms are the terms an invoice of sub is issued under now.
func (c *Closer) Terms(ctx context.Context, q *db.Queries, sub db.InstanceBilling) (invoices.Terms, error) {
	defaults, err := settings.Read(ctx, q, sub.OrganizationID)
	if err != nil {
		return invoices.Terms{}, err
	}
	return subscriptions.Terms(sub, defaults), nil
}

// Released records that row left its hold, then what it became.
func (c *Closer) Released(ctx context.Context, row db.InstanceInvoice, releasedBy string, former invoices.HoldDetail) error {
	invoice, err := invoices.FromRow(row)
	if err != nil {
		return err
	}
	reason := ""
	if row.HoldReleaseReason != nil {
		reason = *row.HoldReleaseReason
	}
	if err := invoices.Announce(ctx, c.outbox, row.OrganizationID, events.InstanceInvoiceReleased, invoices.ReleasedInvoice{
		InvoiceSummary: invoice.InvoiceSummary, ReleaseReason: reason, ReleasedBy: releasedBy, HoldDetail: former,
	}); err != nil {
		return err
	}
	return invoices.AnnounceComposed(ctx, c.outbox, row)
}

// RecheckHeld checks the journals of up to limit held invoices again, and
// releases and issues the ones whose journal is now sound. A gap or a broken
// chain in an append-only journal does not mend: most holds stay until a
// person releases or recomposes them.
func (c *Closer) RecheckHeld(ctx context.Context, limit int) (released int, err error) {
	c.cursorMu.Lock()
	cursor := c.heldCursor
	c.cursorMu.Unlock()

	held, err := c.listHeld(ctx, cursor, limit)
	if err != nil {
		return 0, err
	}
	// Past the last held invoice: wrap to the oldest, so a pass never finds
	// nothing while holds remain.
	if len(held) == 0 && cursor != nil {
		if held, err = c.listHeld(ctx, nil, limit); err != nil {
			return 0, err
		}
	}
	var next *heldCursor
	if len(held) == limit {
		last := held[len(held)-1]
		next = &heldCursor{HeldAt: last.HeldAt, ID: last.ID}
	}
	c.cursorMu.Lock()
	c.heldCursor = next
	c.cursorMu.Unlock()

	for _, invoice := range held {
		ok, err := c.recheckOne(ctx, invoice.ID)
		if err != nil {
			slog.ErrorContext(ctx, "held invoice re-check failed", "invoice_id", invoice.ID, "error", err)
			continue
		}
		if ok {
			released++
			add(ctx, c.m.released, 1)
		}
	}
	return released, nil
}

// heldCursor is where a re-check pass stopped: the next one starts after it.
type heldCursor struct {
	HeldAt pgtype.Timestamp
	ID     uuid.UUID
}

func (c *Closer) listHeld(ctx context.Context, after *heldCursor, limit int) ([]db.ListHeldInvoicesRow, error) {
	// No cursor (a NULL instant): from the oldest held invoice.
	var afterHeldAt pgtype.Timestamp
	var afterID uuid.UUID
	if after != nil {
		afterHeldAt, afterID = after.HeldAt, after.ID
	}
	return c.deps.Queries(ctx).ListHeldInvoices(ctx, db.ListHeldInvoicesParams{
		AfterHeldAt: afterHeldAt, AfterID: afterID,
		PageSize: int32(limit), //nolint:gosec // bounded by the batch size
	})
}

func (c *Closer) recheckOne(ctx context.Context, invoiceID uuid.UUID) (released bool, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic re-checking invoice %s: %v", invoiceID, r)
		}
	}()
	err = c.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := c.deps.Queries(ctx)
		peek, err := q.GetHeldInvoice(ctx, invoiceID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		sub, err := q.LockDueSubscription(ctx, peek.InstanceBillingID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		row, err := q.LockInvoice(ctx, db.LockInvoiceParams{OrganizationID: peek.OrganizationID, ID: invoiceID})
		if err != nil {
			return err
		}
		if row.HoldReason == nil || sub.InstanceID == nil {
			return nil
		}
		recomposed, err := c.Recompose(ctx, q, sub, row, true, "")
		if err != nil || recomposed.Hold != nil {
			return err
		}
		terms, err := c.Terms(ctx, q, sub)
		if err != nil {
			return err
		}
		former, err := invoices.FromRow(row)
		if err != nil {
			return err
		}
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		updated, err := invoices.Rewrite(ctx, q, row, &recomposed.Composition, nil,
			invoices.Release{By: nil, Reason: AutoReleaseReason}, terms, c.deps.Pushes(row.ProviderKind), clock.Time.UTC())
		if err != nil {
			return err
		}
		var detail invoices.HoldDetail
		if former.HoldDetail != nil {
			detail = *former.HoldDetail
		}
		released = true
		return c.Released(ctx, updated, "system", detail)
	})
	return released, err
}
