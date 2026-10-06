// Package invoicelist is the invoice list both list operations share: its
// filters, its two orders and its cursor.
package invoicelist

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Params are the list's query parameters.
type Params struct {
	Status        []string  `query:"status,explode" enum:"DRAFT,PUSHED,PUSH_FAILED,MANUAL,PAID,PAYMENT_FAILED,UNCOLLECTIBLE,VOID" doc:"Only invoices in these statuses; repeat the parameter for several"`
	Kind          string    `query:"kind" enum:"ACTIVATION,RENEWAL,FINAL"`
	ProviderKind  string    `query:"providerKind" enum:"NOOP,STRIPE"`
	CustomerSlug  string    `query:"customerSlug" doc:"Only this customer's invoices: composed under this slug, or of the customer that has it now"`
	Overdue       bool      `query:"overdue" doc:"Only issued invoices still unpaid past their due date"`
	Held          bool      `query:"held" doc:"Only DRAFTs held for their usage journal"`
	HandoffStatus string    `query:"handoffStatus" enum:"NOT_REQUIRED,PENDING,ACKNOWLEDGED"`
	IssuedFrom    time.Time `query:"issuedFrom" doc:"Issued at or after this instant (RFC 3339)"`
	IssuedTo      time.Time `query:"issuedTo" doc:"Issued before this instant (RFC 3339)"`
	BoundaryFrom  time.Time `query:"boundaryFrom" doc:"Billing a boundary at or after this instant"`
	BoundaryTo    time.Time `query:"boundaryTo" doc:"Billing a boundary before this instant"`
	UpdatedSince  time.Time `query:"updatedSince" doc:"Only invoices changed at or after this instant, oldest change first instead of newest invoice first: store the last updatedAt read and pass it next time to miss no change"`
	Cursor        string    `query:"cursor" doc:"Opaque cursor from the previous page's nextCursor"`
	Limit         int32     `query:"limit" minimum:"0" maximum:"200" doc:"Page size, 50 by default, 200 at most"`
}

// cursorKey is where a page ended: the order's timestamp and the id.
type cursorKey struct {
	At time.Time `json:"at"`
	ID uuid.UUID `json:"id"`
}

// List reads one page of an organization's invoices, optionally of one
// subscription. operation prefixes the filter refusals.
func List(ctx context.Context, q *db.Queries, operation string, organizationID uuid.UUID, subscriptionID *uuid.UUID,
	p Params, instanceSlug string, now time.Time,
) (pagination.Page[invoices.InvoiceSummary], error) {
	empty := pagination.Page[invoices.InvoiceSummary]{}
	if err := checkRange(operation, "issued", p.IssuedFrom, p.IssuedTo); err != nil {
		return empty, err
	}
	if err := checkRange(operation, "boundary", p.BoundaryFrom, p.BoundaryTo); err != nil {
		return empty, err
	}
	limit := pagination.ClampLimit(p.Limit)
	var key cursorKey
	hasCursor := p.Cursor != ""
	if hasCursor {
		decoded, err := pagination.Decode[cursorKey](p.Cursor)
		if err != nil {
			if errors.Is(err, pagination.ErrInvalidCursor) {
				return empty, kaitenerrors.Validation("Invoices.InvalidCursor", "the cursor is not one this list returned")
			}
			return empty, err
		}
		key = decoded
	}

	statuses := p.Status
	if statuses == nil {
		statuses = []string{}
	}
	var kind *db.InvoiceKind
	if p.Kind != "" {
		k := db.InvoiceKind(p.Kind)
		kind = &k
	}
	var providerKind *db.BillingProviderKind
	if p.ProviderKind != "" {
		k := db.BillingProviderKind(p.ProviderKind)
		providerKind = &k
	}
	var handoff *db.HandoffStatus
	if p.HandoffStatus != "" {
		h := db.HandoffStatus(p.HandoffStatus)
		handoff = &h
	}

	var rows []db.InstanceInvoice
	var err error
	if !p.UpdatedSince.IsZero() {
		rows, err = q.ListInvoicesUpdatedSince(ctx, db.ListInvoicesUpdatedSinceParams{
			OrganizationID: organizationID, Statuses: statuses, Kind: kind, ProviderKind: providerKind,
			CustomerSlug: optional(p.CustomerSlug), InstanceSlug: optional(instanceSlug), InstanceBillingID: subscriptionID,
			Overdue: p.Overdue, Now: invoices.Timestamp(now), Held: p.Held, HandoffStatus: handoff,
			IssuedFrom: optionalTime(p.IssuedFrom), IssuedTo: optionalTime(p.IssuedTo),
			BoundaryFrom: optionalTime(p.BoundaryFrom), BoundaryTo: optionalTime(p.BoundaryTo),
			UpdatedSince: invoices.Timestamp(p.UpdatedSince),
			HasCursor:    hasCursor, CursorAt: invoices.Timestamp(key.At), CursorID: key.ID, PageSize: limit + 1,
		})
	} else {
		rows, err = q.ListInvoices(ctx, db.ListInvoicesParams{
			OrganizationID: organizationID, Statuses: statuses, Kind: kind, ProviderKind: providerKind,
			CustomerSlug: optional(p.CustomerSlug), InstanceSlug: optional(instanceSlug), InstanceBillingID: subscriptionID,
			Overdue: p.Overdue, Now: invoices.Timestamp(now), Held: p.Held, HandoffStatus: handoff,
			IssuedFrom: optionalTime(p.IssuedFrom), IssuedTo: optionalTime(p.IssuedTo),
			BoundaryFrom: optionalTime(p.BoundaryFrom), BoundaryTo: optionalTime(p.BoundaryTo),
			HasCursor: hasCursor, CursorAt: invoices.Timestamp(key.At), CursorID: key.ID, PageSize: limit + 1,
		})
	}
	if err != nil {
		return empty, err
	}
	summaries := make([]invoices.InvoiceSummary, len(rows))
	for i, row := range rows {
		summaries[i] = invoices.Summary(row)
	}
	byUpdate := !p.UpdatedSince.IsZero()
	return pagination.BuildPage(summaries, limit, func(s invoices.InvoiceSummary) cursorKey {
		if byUpdate {
			return cursorKey{At: s.UpdatedAt, ID: s.ID}
		}
		return cursorKey{At: s.CreatedAt, ID: s.ID}
	})
}

func checkRange(operation, name string, from, to time.Time) error {
	if !from.IsZero() && !to.IsZero() && !from.Before(to) {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidFilter", name+"From must be before "+name+"To")
	}
	return nil
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func optionalTime(t time.Time) pgtype.Timestamp {
	if t.IsZero() {
		return pgtype.Timestamp{}
	}
	return invoices.Timestamp(t)
}
