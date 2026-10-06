package updatebillingsettings

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateBillingSettings"

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute replaces the organization's billing defaults. It records no event:
// the change is kept by the row's updated_by_id and updated_at.
func (u *UseCase) Execute(ctx context.Context, next settings.BillingSettings) (*settings.BillingSettings, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if next.DefaultDaysUntilDue < 0 || next.DefaultDaysUntilDue > 365 {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidDaysUntilDue",
			"defaultDaysUntilDue is between 0 and 365")
	}
	if next.DefaultCollectionMethod != settings.SendInvoice {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidCollectionMethod",
			"only SEND_INVOICE is available: automatic collection needs a payment provider")
	}

	row, err := u.deps.Queries(ctx).UpsertBillingSettings(ctx, db.UpsertBillingSettingsParams{
		OrganizationID:          user.OrganizationID,
		DefaultCollectionMethod: db.CollectionMethod(next.DefaultCollectionMethod),
		DefaultDaysUntilDue:     next.DefaultDaysUntilDue,
		HandoffStripeInvoices:   next.HandoffStripeInvoices,
		UserID:                  user.ID,
	})
	if err != nil {
		return nil, err
	}
	return &settings.BillingSettings{
		DefaultCollectionMethod: string(row.DefaultCollectionMethod),
		DefaultDaysUntilDue:     row.DefaultDaysUntilDue,
		HandoffStripeInvoices:   row.HandoffStripeInvoices,
	}, nil
}
