package getreleases

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
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

func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[*schema.Release], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.Release]{}, err
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[*schema.Release]{}, apierrors.Wrap(err, apierrors.KindValidation, "Releases.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	releases, err := h.repository.GetReleases(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.Release]{}, err
	}

	page, err := pagination.BuildPage(releases, limit, func(r *schema.Release) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: r.CreatedAt, ID: r.ID}
	})
	if err != nil {
		return pagination.Page[*schema.Release]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.ReleaseReadEntitlementSlug)

	return page, nil
}
