// Package listsessioninvoices is GET /public/session/invoices: the invoices a
// customer session may read, as the session sees them.
package listsessioninvoices

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/sessioninvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Session is what the list is scoped to: the session's customer, by id, and
// its instance when the session is bound to one.
type Session struct {
	CustomerID uuid.UUID
	InstanceID *uuid.UUID
}

// Invoices is the billing module's list, through a port this module owns.
type Invoices interface {
	Execute(ctx context.Context, query sessioninvoices.Query) (pagination.Page[invoices.Invoice], error)
}

type UseCase struct{ invoices Invoices }

func NewUseCase(invoices Invoices) *UseCase { return &UseCase{invoices: invoices} }

// Execute lists one page.
func (u *UseCase) Execute(ctx context.Context, session Session, cursor string, limit int32) (pagination.Page[sessions.SessionInvoice], error) {
	page, err := u.invoices.Execute(ctx, sessioninvoices.Query{
		CustomerID: session.CustomerID, InstanceID: session.InstanceID, Cursor: cursor, Limit: limit,
	})
	if err != nil {
		return pagination.Page[sessions.SessionInvoice]{}, err
	}
	items := make([]sessions.SessionInvoice, 0, len(page.Items))
	for _, invoice := range page.Items {
		items = append(items, sessions.InvoiceFrom(invoice))
	}
	return pagination.Page[sessions.SessionInvoice]{Items: items, HasMore: page.HasMore, NextCursor: page.NextCursor}, nil
}
