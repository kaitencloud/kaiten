package syncinvoice

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncing"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "SyncInvoice"

type UseCase struct {
	deps   access.Deps
	syncer *syncing.Syncer
}

func NewUseCase(deps access.Deps, syncer *syncing.Syncer) *UseCase {
	return &UseCase{deps: deps, syncer: syncer}
}

// Execute reads one invoice from its provider now and applies what it says.
func (u *UseCase) Execute(ctx context.Context, invoiceID uuid.UUID) (*invoices.Invoice, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	row, err := u.deps.Queries(ctx).GetInvoiceByID(ctx, invoiceID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.OrganizationID != user.OrganizationID) {
		return nil, kaitenerrors.NotFoundf(operation+".NotFound", "invoice %s not found", invoiceID)
	}
	if err != nil {
		return nil, err
	}
	if row.ProviderKind == db.BillingProviderKindNOOP || row.ExternalInvoiceID == nil {
		return nil, kaitenerrors.Conflict(operation+".NotPushed", "the invoice is not in a payment provider")
	}
	synced, err := u.syncer.Invoice(ctx, row)
	if err != nil {
		var apiErr *kaitenerrors.Error
		if errors.As(err, &apiErr) {
			return nil, err
		}
		return nil, providers.APIError(operation, err)
	}
	invoice, err := invoices.FromRow(synced)
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}
