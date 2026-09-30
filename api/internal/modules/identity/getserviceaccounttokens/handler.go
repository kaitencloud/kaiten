package getserviceaccounttokens

import (
	"context"
	"fmt"

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

func (h *UseCase) Execute(ctx context.Context, saSlug string, limit int32, cursor *string) (pagination.Page[schema.Token], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[schema.Token]{}, fmt.Errorf("failed to get current user: %w", err)
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[schema.Token]{}, apierrors.Wrap(err, apierrors.KindValidation, "ServiceAccountTokens.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	tokens, err := h.repository.ListTokens(ctx, ListTokensInput{
		ServiceAccountSlug: saSlug,
		OrganizationID:     user.OrganizationID,
		LimitPlusOne:       limit + 1,
		Cursor:             cursorKey,
	})
	if err != nil {
		return pagination.Page[schema.Token]{}, fmt.Errorf("failed to list tokens: %w", err)
	}

	page, err := pagination.BuildPage(tokens, limit, func(t schema.Token) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: t.CreatedAt, ID: t.ID}
	})
	if err != nil {
		return pagination.Page[schema.Token]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.ServiceAccountTokenReadEntitlementSlug)

	return page, nil
}
