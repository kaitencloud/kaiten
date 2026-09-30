package getfeatureflags

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
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

func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[schema.FeatureFlag], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[schema.FeatureFlag]{}, err
	}

	var cursorKey *pagination.IDCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.IDCursor](*cursor)
		if err != nil {
			return pagination.Page[schema.FeatureFlag]{}, apierrors.Wrap(err, apierrors.KindValidation, "FeatureFlags.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	flags, err := h.repository.GetFeatureFlags(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[schema.FeatureFlag]{}, err
	}

	page, err := pagination.BuildPage(flags, limit, func(f schema.FeatureFlag) pagination.IDCursor {
		return pagination.IDCursor{ID: f.ID}
	})
	if err != nil {
		return pagination.Page[schema.FeatureFlag]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.FeatureFlagReadEntitlementSlug)

	return page, nil
}
