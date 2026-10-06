package listhandoff

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// QueuedInvoice is an invoice in the handoff queue, waiting or acknowledged.
type QueuedInvoice struct {
	invoices.InvoiceSummary
	Handoff invoices.Handoff `json:"handoff"`
}

type cursorKey struct {
	IssuedAt time.Time `json:"issuedAt"`
	ID       uuid.UUID `json:"id"`
}

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the handoff queue in one status, oldest issue first, without
// leasing anything.
func (u *UseCase) Execute(ctx context.Context, status string, cursor string, limit int32) (pagination.Page[QueuedInvoice], error) {
	empty := pagination.Page[QueuedInvoice]{}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return empty, err
	}
	if status == "" {
		status = invoices.HandoffPending
	}
	if status != invoices.HandoffPending && status != invoices.HandoffAcknowledged {
		return empty, kaitenerrors.UnprocessableEntity("ListHandoff.InvalidStatus", "status is PENDING or ACKNOWLEDGED")
	}
	limit = pagination.ClampLimit(limit)
	var key cursorKey
	if cursor != "" {
		key, err = pagination.Decode[cursorKey](cursor)
		if errors.Is(err, pagination.ErrInvalidCursor) {
			return empty, kaitenerrors.Validation("Handoff.InvalidCursor", "the cursor is not one this list returned")
		}
		if err != nil {
			return empty, err
		}
	}
	rows, err := u.deps.Queries(ctx).ListHandoff(ctx, db.ListHandoffParams{
		OrganizationID: user.OrganizationID, HandoffStatus: db.HandoffStatus(status),
		HasCursor: cursor != "", CursorAt: invoices.Timestamp(key.IssuedAt), CursorID: key.ID, PageSize: limit + 1,
	})
	if err != nil {
		return empty, err
	}
	items := make([]QueuedInvoice, len(rows))
	for i, row := range rows {
		invoice, err := invoices.FromRow(row)
		if err != nil {
			return empty, err
		}
		items[i] = QueuedInvoice{InvoiceSummary: invoice.InvoiceSummary, Handoff: invoice.Handoff}
	}
	return pagination.BuildPage(items, limit, func(item QueuedInvoice) cursorKey {
		return cursorKey{IssuedAt: *item.IssuedAt, ID: item.ID}
	})
}
