package getcomponents

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
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

func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[*componentschema.Component], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*componentschema.Component]{}, err
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[*componentschema.Component]{}, apierrors.Wrap(err, apierrors.KindValidation, "Components.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	components, err := h.repository.GetComponents(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*componentschema.Component]{}, err
	}

	page, err := pagination.BuildPage(components, limit, func(c *componentschema.Component) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: c.CreatedAt, ID: c.ID}
	})
	if err != nil {
		return pagination.Page[*componentschema.Component]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.ComponentReadEntitlementSlug)

	return page, nil
}
