package createtokenonserviceaccount

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
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
	repository *CommandRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewCommandRepository(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context, serviceAccountSlug, name string, slug *string, scopes []string, expiresAt *time.Time) (*schema.PlainToken, error) {
	// Validate scopes
	if err := scope.ValidateScopes(scopes); err != nil {
		return nil, kaitenerrors.ValidationWithDetails("Token.InvalidScopes", "invalid scopes", map[string]any{
			"scopes": err.Error(),
		})
	}

	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current user: %w", err)
	}

	plainToken, err := random.GeneratePrefixed("ksh_", 32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	hashedToken, err := token.Hash(plainToken)
	if err != nil {
		return nil, fmt.Errorf("failed to hash token: %w", err)
	}

	attempt := func(resolvedSlug string) (*schema.PlainToken, error) {
		createdToken, err := h.repository.CreateToken(ctx, CreateTokenInput{
			ServiceAccountSlug: serviceAccountSlug,
			CreatedByID:        user.ID,
			OrganizationID:     user.OrganizationID,
			Scopes:             scopes,
			Hash:               hashedToken,
			Name:               name,
			Slug:               resolvedSlug,
			LookupHash:         token.LookupHash(plainToken),
			ExpiresAt:          expiresAt,
		})
		if err != nil {
			var kaitenErr *kaitenerrors.Error
			if errors.As(err, &kaitenErr) {
				return nil, err
			}
			return nil, fmt.Errorf("failed to create token in repository: %w", err)
		}

		return &schema.PlainToken{
			Value: plainToken,
			Token: *createdToken,
		}, nil
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, user.OrganizationID, dogfooding.ServiceAccountTokenEntitlementSlug,
		"CreateToken.TokenLimitReached", "Service account token creation limit reached for this organization", nil,
		func(_ context.Context) (*schema.PlainToken, error) {
			if slug != nil {
				resolvedSlug, err := slugutil.New(*slug)
				if err != nil {
					return nil, kaitenerrors.Validation("CreateToken.InvalidSlug", slugutil.InvalidReason(*slug))
				}
				return attempt(resolvedSlug.String())
			}

			// No caller-supplied slug: derive one from the name. GenerateUnique's
			// random suffix makes a database-level collision astronomically
			// unlikely but, per its own doc comment, not impossible -- so a rare
			// conflict is retried with a freshly generated slug rather than
			// surfaced as a hard failure for something outside the caller's
			// control.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return slugutil.GenerateUnique(name) },
				attempt,
			)
		})
}
