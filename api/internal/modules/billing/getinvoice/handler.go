package getinvoice

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads one invoice of the organization, with its lines.
func (u *UseCase) Execute(ctx context.Context, invoiceID uuid.UUID) (*invoices.Invoice, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	return Read(ctx, u.deps.Queries(ctx), user.OrganizationID, invoiceID, "GetInvoice.NotFound")
}

// Read reads one invoice of the organization with the invoice recomposed
// from it; notFound is the code an unknown id answers.
func Read(ctx context.Context, q *db.Queries, organizationID, invoiceID uuid.UUID, notFound string) (*invoices.Invoice, error) {
	row, err := q.GetInvoice(ctx, db.GetInvoiceParams{OrganizationID: organizationID, ID: invoiceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.NotFoundf(notFound, "invoice %s not found", invoiceID)
	}
	if err != nil {
		return nil, err
	}
	invoice, err := invoices.FromRow(row)
	if err != nil {
		return nil, err
	}
	replacement, err := q.GetReplacementInvoiceID(ctx, &invoiceID)
	if err == nil {
		invoice.ReplacedByInvoiceID = &replacement
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return &invoice, nil
}
