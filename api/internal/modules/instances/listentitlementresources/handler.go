package listentitlementresources

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// operation prefixes this operation's error codes.
const operation = "ListEntitlementResources"

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries, deps.AIPolicy),
	}
}

// cursorKey is where a page stopped: the last resource it listed. The list is
// ordered by key, which the primary key makes a keyset.
type cursorKey struct {
	ResourceKey string `json:"resourceKey"`
}

// Execute lists one page of the resources of the pair named by the slugs.
func (h *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug string, limit int32, cursor *string) (pagination.Page[schema.EntitlementResource], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[schema.EntitlementResource]{}, err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)

	var after *string
	if cursor != nil {
		key, err := pagination.Decode[cursorKey](*cursor)
		if err != nil {
			return pagination.Page[schema.EntitlementResource]{}, apierrors.Wrap(err, apierrors.KindValidation, operation+".InvalidCursor", "invalid cursor")
		}
		after = &key.ResourceKey
	}
	limit = pagination.ClampLimit(limit)

	items, err := h.repository.List(ctx, instanceSlug, entitlementSlug, user.OrganizationID, after, limit+1)
	if err != nil {
		return pagination.Page[schema.EntitlementResource]{}, err
	}

	return pagination.BuildPage(items, limit, func(item schema.EntitlementResource) cursorKey {
		return cursorKey{ResourceKey: item.ResourceKey}
	})
}
