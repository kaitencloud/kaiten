package getcustomers

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
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

func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[*schema.Customer], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.Customer]{}, err
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[*schema.Customer]{}, apierrors.Wrap(err, apierrors.KindValidation, "Customers.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	customers, err := h.repository.GetCustomers(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.Customer]{}, err
	}

	page, err := pagination.BuildPage(customers, limit, func(c *schema.Customer) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: c.CreatedAt, ID: c.ID}
	})
	if err != nil {
		return pagination.Page[*schema.Customer]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.CustomerReadEntitlementSlug)

	return page, nil
}
