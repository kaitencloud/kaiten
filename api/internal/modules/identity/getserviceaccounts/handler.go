package getserviceaccounts

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	Queries       *db.Queries
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[*schema.ServiceAccount], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.ServiceAccount]{}, err
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[*schema.ServiceAccount]{}, apierrors.Wrap(err, apierrors.KindValidation, "ServiceAccounts.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	serviceAccounts, err := h.repository.GetServiceAccounts(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.ServiceAccount]{}, err
	}

	page, err := pagination.BuildPage(serviceAccounts, limit, func(sa *schema.ServiceAccount) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: sa.CreatedAt, ID: sa.ID}
	})
	if err != nil {
		return pagination.Page[*schema.ServiceAccount]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.ServiceAccountReadEntitlementSlug)

	return page, nil
}
