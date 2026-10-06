package invoices

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

// Terms are how an invoice is collected, resolved when it is composed.
type Terms struct {
	CollectionMethod string
	DaysUntilDue     int32
}

// Hold is why a composed invoice is held instead of issued.
type Hold struct {
	Reason string
	Detail HoldDetail
}

// Draft is an invoice as composed, before it is written.
type Draft struct {
	Subscription      db.InstanceBilling
	LicenseID         uuid.UUID
	LicenseSlug       string
	BillingEmail      *string
	Kind              rating.Kind
	BoundaryAt        time.Time
	Composition       rating.Composition
	Terms             Terms
	Hold              *Hold
	ReplacesInvoiceID *uuid.UUID
	Now               time.Time
}

// Insert writes a composed invoice, issued by the subscription's provider.
// Without a provider (NOOP) an invoice is issued at once:
//   - held: a DRAFT, issued only once released or recomposed;
//   - nothing owed: PAID at issue, never handed off;
//   - otherwise MANUAL, due after the terms' days, and PENDING in the handoff
//     queue for the organization's accounting system.
//
// Every line gets the identifier it keeps for the invoice's life.
func Insert(ctx context.Context, q *db.Queries, d Draft) (db.InstanceInvoice, error) {
	lines := d.Composition.Lines
	if lines == nil {
		lines = []rating.InvoiceLine{}
	}
	from, to := d.BoundaryAt, d.BoundaryAt
	for i := range lines {
		id := uuid.New()
		lines[i].ID = &id
		if i == 0 || lines[i].ServiceFrom.Before(from) {
			from = lines[i].ServiceFrom
		}
		if i == 0 || lines[i].ServiceTo.After(to) {
			to = lines[i].ServiceTo
		}
	}
	encoded, err := json.Marshal(lines)
	if err != nil {
		return db.InstanceInvoice{}, fmt.Errorf("encode invoice lines: %w", err)
	}

	sub := d.Subscription
	params := db.InsertInvoiceParams{
		OrganizationID:     sub.OrganizationID,
		InstanceBillingID:  sub.ID,
		CustomerID:         sub.CustomerID,
		InstanceSlug:       sub.InstanceSlug,
		InstanceName:       sub.InstanceName,
		CustomerSlug:       sub.CustomerSlug,
		CustomerName:       sub.CustomerName,
		LicenseID:          d.LicenseID,
		LicenseSlug:        d.LicenseSlug,
		BillingEmail:       d.BillingEmail,
		Kind:               db.InvoiceKind(d.Kind),
		BoundaryAt:         Timestamp(d.BoundaryAt),
		ServiceFrom:        Timestamp(from),
		ServiceTo:          Timestamp(to),
		Currency:           sub.Currency,
		SubtotalMinor:      d.Composition.Subtotal,
		DiscountTotalMinor: d.Composition.DiscountTotal,
		TotalMinor:         d.Composition.Total,
		Lines:              encoded,
		Status:             db.InvoiceStatusDRAFT,
		HoldReason:         nil,
		HoldDetail:         nil,
		HeldAt:             pgtype.Timestamp{},
		ProviderKind:       sub.ProviderKind,
		CollectionMethod:   db.CollectionMethod(d.Terms.CollectionMethod),
		IssuedAt:           pgtype.Timestamp{},
		DaysUntilDue:       nil,
		DueAt:              pgtype.Timestamp{},
		PaidAt:             pgtype.Timestamp{},
		ReplacesInvoiceID:  d.ReplacesInvoiceID,
		HandoffStatus:      db.HandoffStatusNOTREQUIRED,
		Now:                Timestamp(d.Now),
	}
	if d.Hold != nil {
		reason := db.InvoiceHoldReason(d.Hold.Reason)
		detail, err := json.Marshal(d.Hold.Detail)
		if err != nil {
			return db.InstanceInvoice{}, fmt.Errorf("encode hold detail: %w", err)
		}
		params.HoldReason, params.HoldDetail, params.HeldAt = &reason, detail, Timestamp(d.Now)
	} else {
		issued := issue(d.Composition.Total, d.Terms, d.Now)
		params.Status, params.IssuedAt, params.DaysUntilDue = issued.status, issued.issuedAt, issued.daysUntilDue
		params.DueAt, params.PaidAt, params.HandoffStatus = issued.dueAt, issued.paidAt, issued.handoff
	}
	return q.InsertInvoice(ctx, params)
}

// issuance is how an invoice leaves composition, or its hold.
type issuance struct {
	status       db.InvoiceStatus
	issuedAt     pgtype.Timestamp
	daysUntilDue *int32
	dueAt        pgtype.Timestamp
	paidAt       pgtype.Timestamp
	handoff      db.HandoffStatus
}

// issue is the issuance of an invoice without a payment provider: PAID at
// issue when nothing is owed, never handed off; otherwise MANUAL, due after
// the terms' days and PENDING in the handoff queue.
func issue(total int64, terms Terms, now time.Time) issuance {
	if total == 0 {
		zero := int32(0)
		return issuance{
			status: db.InvoiceStatusPAID, issuedAt: Timestamp(now), daysUntilDue: &zero,
			dueAt: Timestamp(now), paidAt: Timestamp(now), handoff: db.HandoffStatusNOTREQUIRED,
		}
	}
	days := terms.DaysUntilDue
	return issuance{
		status: db.InvoiceStatusMANUAL, issuedAt: Timestamp(now), daysUntilDue: &days,
		dueAt: Timestamp(now.AddDate(0, 0, int(days))), paidAt: pgtype.Timestamp{}, handoff: db.HandoffStatusPENDING,
	}
}

// Release is how a held draft leaves its hold: by whom (nil for a later
// check of the close) and why.
type Release struct {
	By     *uuid.UUID
	Reason string
}

// Rewrite writes a held draft again: with lines recomposed when composition
// is given, else its own; still held when hold is given, else released and
// issued.
func Rewrite(ctx context.Context, q *db.Queries, row db.InstanceInvoice, composition *rating.Composition,
	hold *Hold, release Release, terms Terms, now time.Time,
) (db.InstanceInvoice, error) {
	params := db.RewriteInvoiceParams{
		Lines: row.Lines, ServiceFrom: row.ServiceFrom, ServiceTo: row.ServiceTo,
		SubtotalMinor: row.SubtotalMinor, DiscountTotalMinor: row.DiscountTotalMinor, TotalMinor: row.TotalMinor,
		Status: db.InvoiceStatusDRAFT, HoldReason: row.HoldReason, HoldDetail: row.HoldDetail, HeldAt: row.HeldAt,
		HoldReleasedAt: row.HoldReleasedAt, HoldReleasedByID: row.HoldReleasedByID, HoldReleaseReason: row.HoldReleaseReason,
		IssuedAt: pgtype.Timestamp{}, DaysUntilDue: nil, DueAt: pgtype.Timestamp{}, PaidAt: pgtype.Timestamp{},
		HandoffStatus: db.HandoffStatusNOTREQUIRED, Now: Timestamp(now), ID: row.ID,
	}
	total := row.TotalMinor
	if composition != nil {
		lines := composition.Lines
		if lines == nil {
			lines = []rating.InvoiceLine{}
		}
		from, to := row.BoundaryAt.Time.UTC(), row.BoundaryAt.Time.UTC()
		for i := range lines {
			if lines[i].ID == nil {
				id := uuid.New()
				lines[i].ID = &id
			}
			if i == 0 || lines[i].ServiceFrom.Before(from) {
				from = lines[i].ServiceFrom
			}
			if i == 0 || lines[i].ServiceTo.After(to) {
				to = lines[i].ServiceTo
			}
		}
		encoded, err := json.Marshal(lines)
		if err != nil {
			return db.InstanceInvoice{}, fmt.Errorf("encode invoice lines: %w", err)
		}
		params.Lines, params.ServiceFrom, params.ServiceTo = encoded, Timestamp(from), Timestamp(to)
		params.SubtotalMinor, params.DiscountTotalMinor, params.TotalMinor = composition.Subtotal, composition.DiscountTotal, composition.Total
		total = composition.Total
	}
	if hold != nil {
		reason := db.InvoiceHoldReason(hold.Reason)
		detail, err := json.Marshal(hold.Detail)
		if err != nil {
			return db.InstanceInvoice{}, fmt.Errorf("encode hold detail: %w", err)
		}
		params.HoldReason, params.HoldDetail = &reason, detail
		if !params.HeldAt.Valid {
			params.HeldAt = Timestamp(now)
		}
		return q.RewriteInvoice(ctx, params)
	}
	reason := release.Reason
	params.HoldReason, params.HoldDetail, params.HeldAt = nil, nil, pgtype.Timestamp{}
	params.HoldReleasedAt, params.HoldReleasedByID, params.HoldReleaseReason = Timestamp(now), release.By, &reason
	issued := issue(total, terms, now)
	params.Status, params.IssuedAt, params.DaysUntilDue = issued.status, issued.issuedAt, issued.daysUntilDue
	params.DueAt, params.PaidAt, params.HandoffStatus = issued.dueAt, issued.paidAt, issued.handoff
	return q.RewriteInvoice(ctx, params)
}

// FromRow is an invoice row as the API returns it.
func FromRow(row db.InstanceInvoice) (Invoice, error) {
	var lines []rating.InvoiceLine
	if err := json.Unmarshal(row.Lines, &lines); err != nil {
		return Invoice{}, fmt.Errorf("decode lines of invoice %s: %w", row.ID, err)
	}
	if lines == nil {
		lines = []rating.InvoiceLine{}
	}
	invoice := Invoice{
		InvoiceSummary: Summary(row),
		LicenseID:      row.LicenseID,
		Lines:          lines,
		BillingEmail:   row.BillingEmail,
		HoldDetail:     nil,
		Hold:           nil,
		Handoff: Handoff{
			Status:            string(row.HandoffStatus),
			LeaseID:           row.HandoffLeaseID,
			LeasedUntil:       TimePtr(row.HandoffLeasedUntil),
			ClaimCount:        row.HandoffClaimCount,
			AcknowledgedAt:    TimePtr(row.HandoffAcknowledgedAt),
			ExternalReference: row.ExternalReference,
		},
		UncollectibleAt:     TimePtr(row.UncollectibleAt),
		VoidedAt:            TimePtr(row.VoidedAt),
		VoidReason:          row.VoidReason,
		ReplacesInvoiceID:   row.ReplacesInvoiceID,
		ReplacedByInvoiceID: nil,
	}
	if len(row.HoldDetail) > 0 {
		var detail HoldDetail
		if err := json.Unmarshal(row.HoldDetail, &detail); err != nil {
			return Invoice{}, fmt.Errorf("decode hold detail of invoice %s: %w", row.ID, err)
		}
		invoice.HoldDetail = &detail
	}
	if row.HeldAt.Valid || row.HoldReleasedAt.Valid {
		invoice.Hold = &HoldRecord{
			HeldAt:        TimePtr(row.HeldAt),
			ReleasedAt:    TimePtr(row.HoldReleasedAt),
			ReleasedBy:    row.HoldReleasedByID,
			ReleaseReason: row.HoldReleaseReason,
		}
	}
	return invoice, nil
}

// Summary is an invoice row without its lines.
func Summary(row db.InstanceInvoice) InvoiceSummary {
	var holdReason *string
	if row.HoldReason != nil {
		reason := string(*row.HoldReason)
		holdReason = &reason
	}
	return InvoiceSummary{
		ID:               row.ID,
		Kind:             string(row.Kind),
		BoundaryAt:       row.BoundaryAt.Time.UTC(),
		ServiceFrom:      row.ServiceFrom.Time.UTC(),
		ServiceTo:        row.ServiceTo.Time.UTC(),
		Status:           string(row.Status),
		HoldReason:       holdReason,
		ProviderKind:     string(row.ProviderKind),
		CollectionMethod: string(row.CollectionMethod),
		Currency:         row.Currency,
		Subtotal:         row.SubtotalMinor,
		DiscountTotal:    row.DiscountTotalMinor,
		Total:            row.TotalMinor,
		IssuedAt:         TimePtr(row.IssuedAt),
		DaysUntilDue:     row.DaysUntilDue,
		DueAt:            TimePtr(row.DueAt),
		PaidAt:           TimePtr(row.PaidAt),
		CustomerSlug:     row.CustomerSlug,
		CustomerName:     row.CustomerName,
		InstanceSlug:     row.InstanceSlug,
		InstanceName:     row.InstanceName,
		LicenseSlug:      row.LicenseSlug,
		HandoffStatus:    string(row.HandoffStatus),
		CreatedAt:        row.CreatedAt.Time.UTC(),
		UpdatedAt:        row.UpdatedAt.Time.UTC(),
	}
}

// Timestamp is a time as the billing tables store it.
func Timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
}

// TimePtr is a nullable stored time, in UTC.
func TimePtr(ts pgtype.Timestamp) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}
