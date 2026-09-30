package getentitlementgroups

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
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

// UseCase handles listing entitlement groups.
type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

// NewUseCase creates a new UseCase with all dependencies wired.
func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries),
	}
}

// Execute executes the list entitlement groups use case.
func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[*schema.EntitlementGroup], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.EntitlementGroup]{}, err
	}

	var cursorKey *pagination.IDCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.IDCursor](*cursor)
		if err != nil {
			return pagination.Page[*schema.EntitlementGroup]{}, apierrors.Wrap(err, apierrors.KindValidation, "EntitlementGroups.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	groups, err := h.repository.GetEntitlementGroups(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.EntitlementGroup]{}, err
	}

	page, err := pagination.BuildPage(groups, limit, func(g *schema.EntitlementGroup) pagination.IDCursor {
		return pagination.IDCursor{ID: g.ID}
	})
	if err != nil {
		return pagination.Page[*schema.EntitlementGroup]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementGroupReadEntitlementSlug)

	return page, nil
}
