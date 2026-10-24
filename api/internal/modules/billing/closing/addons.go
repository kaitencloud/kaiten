package closing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

// addonArrears is what an arrears period [periodStart, boundary) bills of the
// add-ons (§10.4), measured up to until (the boundary, or now for a
// preview):
//   - one ARREARS fee per add-on family attached at any time in the period,
//     for the attachment active at the boundary, else the one removed last,
//     over its window [max(P0, attached), min(B, removed)), in full;
//   - each metered price of each attachment, rated over the attachment's
//     window (§8.2 rule 4), its journal checked over that window as a licence
//     price's is. A window that starts at P0 continues the previous invoice's
//     fingerprint; one that starts later does not, since what came before it
//     was not this price's to bill.
//
// Prices in another currency than the subscription's are left out, as an
// add-on priced in another one cannot be on its invoice.
func (c *Closer) addonArrears(ctx context.Context, q *db.Queries, sub db.InstanceBilling, periodStart, boundary, until time.Time) (
	[]rating.AddonCharge, []rating.AddonMeter, []invoices.HeldPair, error,
) {
	attachments, err := c.attachments(ctx, sub, periodStart, boundary)
	if err != nil || len(attachments) == 0 {
		return nil, nil, nil, err
	}
	window := func(a ports.BillableAttachment, to time.Time) rating.Period {
		w := rating.Period{From: periodStart, To: to}
		if a.AttachedAt.After(w.From) {
			w.From = a.AttachedAt
		}
		if a.RemovedAt != nil && a.RemovedAt.Before(w.To) {
			w.To = *a.RemovedAt
		}
		return w
	}

	// The fee of each family: the attachment active at B, else the last
	// removed. Attachments come in attachment order.
	byFamily := map[uuid.UUID]ports.BillableAttachment{}
	var families []uuid.UUID
	for _, a := range attachments {
		if a.Flat == nil || a.Flat.BillingTiming != rating.TimingArrears || a.Flat.Currency != sub.Currency {
			continue
		}
		current, seen := byFamily[a.FamilyID]
		if !seen {
			families = append(families, a.FamilyID)
		}
		switch {
		case !seen, current.RemovedAt != nil && (a.RemovedAt == nil || a.RemovedAt.After(*current.RemovedAt)):
			byFamily[a.FamilyID] = a
		}
	}
	var charges []rating.AddonCharge
	for _, family := range families {
		a := byFamily[family]
		service := window(a, boundary)
		charge := metering.Addons([]ports.BillableAddon{*a.Flat}, sub.Currency)[0]
		charge.Service = &service
		charges = append(charges, charge)
	}

	if sub.InstanceID == nil {
		return charges, nil, nil, nil
	}
	previous, err := previousLedgers(ctx, q, sub.ID, until)
	if err != nil {
		return nil, nil, nil, err
	}
	var meters []rating.AddonMeter
	var held []invoices.HeldPair
	for _, a := range attachments {
		w := window(a, until)
		if !w.From.Before(w.To) {
			continue
		}
		for _, price := range a.Metered {
			if price.EntitlementID == nil || price.Currency != sub.Currency {
				continue
			}
			ref := ports.UsageRef{OrganizationID: sub.OrganizationID, InstanceID: *sub.InstanceID, EntitlementID: *price.EntitlementID}
			summary, err := c.deps.Usage.Summarize(ctx, ref, w.From, w.To)
			if err != nil {
				return nil, nil, nil, err
			}
			measure := metering.Measure(summary)
			instanceID := ref.InstanceID
			measure.Ledger.InstanceID = &instanceID
			var prev *ports.Fingerprint
			if w.From.Equal(periodStart) {
				prev = previous[ref.EntitlementID]
			}
			failures, err := c.deps.Usage.CheckInvariants(ctx, ref, w.From, w.To, prev)
			if err != nil {
				return nil, nil, nil, err
			}
			for _, failure := range failures {
				held = append(held, invoices.HeldPair{InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID, InvariantFailure: failure})
			}
			meters = append(meters, rating.AddonMeter{
				InstanceAddonID: a.InstanceAddonID, AddonID: a.AddonID, Price: metering.Price(price), Window: w, Measure: measure,
			})
		}
	}
	return charges, meters, held, nil
}

// TrueUp is the family setting that trues up an ADVANCE add-on (V31-70).
const increaseTrueUp = "TRUE_UP"

// addonTrueUps are the ADVANCE true-ups a RENEWAL or a FINAL at boundary bills
// for the elapsed period [prev, boundary) (V31-70, §10.4): for each attachment
// active in it whose family is TRUE_UP and whose flat fee for the elapsed
// period is billed in advance, the units it held above what prev's ADVANCE
// line billed it -- period_max_quantity minus that line's quantity, 0 when it
// started after prev -- over [max(prev, attached), min(boundary, removed)), in
// full, at the price of the elapsed period's billing period.
func (c *Closer) addonTrueUps(ctx context.Context, q *db.Queries, sub db.InstanceBilling, prev, boundary time.Time) ([]rating.AddonCharge, error) {
	attachments, err := c.attachments(ctx, sub, prev, boundary)
	if err != nil || len(attachments) == 0 {
		return nil, err
	}
	billed, err := billedInAdvance(ctx, q, sub.ID, prev, boundary)
	if err != nil {
		return nil, err
	}
	var out []rating.AddonCharge
	for _, a := range attachments {
		if a.Flat == nil || a.Flat.BillingTiming == rating.TimingArrears || a.Flat.Currency != sub.Currency || a.IncreaseBilling != increaseTrueUp {
			continue
		}
		already := billed[a.InstanceAddonID]
		if a.PeriodMaxQuantity <= already {
			continue
		}
		w := rating.Period{From: prev, To: boundary}
		if a.AttachedAt.After(w.From) {
			w.From = a.AttachedAt
		}
		if a.RemovedAt != nil && a.RemovedAt.Before(w.To) {
			w.To = *a.RemovedAt
		}
		if !w.From.Before(w.To) {
			continue
		}
		charge := metering.Addons([]ports.BillableAddon{*a.Flat}, sub.Currency)[0]
		charge.Quantity = a.PeriodMaxQuantity - already
		charge.Service = &w
		charge.TrueUp = &rating.InvoiceLineTrueUp{MaxQuantity: a.PeriodMaxQuantity, BilledQuantity: already}
		out = append(out, charge)
	}
	return out, nil
}

// billedInAdvance is what the boundary prev billed each attachment in
// advance: the quantity of the ADVANCE ADDON line, not a true-up, that names
// it and starts at prev, on the subscription's last live invoice before
// boundary.
func billedInAdvance(ctx context.Context, q *db.Queries, subscriptionID uuid.UUID, prev, boundary time.Time) (map[uuid.UUID]int32, error) {
	out := map[uuid.UUID]int32{}
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
		if line.Type != rating.LineAddon || line.TrueUp != nil || line.InstanceAddonID == nil || line.Metering != nil ||
			line.BillingTiming == nil || *line.BillingTiming == rating.TimingArrears || !line.ServiceFrom.Equal(prev) {
			continue
		}
		quantity, err := decimal.NewFromString(line.Quantity)
		if err != nil {
			return nil, fmt.Errorf("decode the quantity of line %d: %w", line.Seq, err)
		}
		units := quantity.IntPart()
		if units < 0 || units > math.MaxInt32 {
			return nil, fmt.Errorf("line %d bills %s units of an add-on", line.Seq, line.Quantity)
		}
		out[*line.InstanceAddonID] += int32(units)
	}
	return out, nil
}

// attachments reads the add-ons attached to the subscription's instance at
// any time in [from, to); none once the instance is deleted.
func (c *Closer) attachments(ctx context.Context, sub db.InstanceBilling, from, to time.Time) ([]ports.BillableAttachment, error) {
	if sub.InstanceID == nil || c.deps.Addons == nil {
		return nil, nil
	}
	return c.deps.Addons.BillableAttachments(ctx, sub.OrganizationID, *sub.InstanceID, string(sub.BillingPeriod), from, to)
}

// addonMeteredEntitlements are the entitlements the add-ons attached in
// [from, to) meter: pairs the close seals with the base version's.
func (c *Closer) addonMeteredEntitlements(ctx context.Context, sub db.InstanceBilling, from, to time.Time) ([]uuid.UUID, error) {
	attachments, err := c.attachments(ctx, sub, from, to)
	if err != nil {
		return nil, err
	}
	var out []uuid.UUID
	for _, a := range attachments {
		for _, price := range a.Metered {
			if price.EntitlementID != nil && !slices.Contains(out, *price.EntitlementID) {
				out = append(out, *price.EntitlementID)
			}
		}
	}
	return out, nil
}

// withPairs adds journal failures to a hold, keeping its reason the first
// invariant failed, in invariant order.
func withPairs(hold *invoices.Hold, pairs []invoices.HeldPair) *invoices.Hold {
	if len(pairs) == 0 {
		return hold
	}
	var all []invoices.HeldPair
	if hold != nil {
		all = append(all, hold.Detail.Pairs...)
	}
	all = append(all, pairs...)
	reason := all[0].Invariant
	for _, pair := range all {
		if slices.Index(invariantOrder, pair.Invariant) < slices.Index(invariantOrder, reason) {
			reason = pair.Invariant
		}
	}
	return &invoices.Hold{Reason: string(reason), Detail: invoices.HoldDetail{Pairs: all}}
}
