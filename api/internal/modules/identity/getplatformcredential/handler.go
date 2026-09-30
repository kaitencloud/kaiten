package getplatformcredential

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
//
// No UserProvider: currentuser.GetUser fails closed for a platform principal by
// design, because there is no organization to resolve. No UsageReporter either --
// there is no organization to meter this against, and a platform operation must
// not consume any tenant's quota.
type Deps struct {
	Queries *db.Queries
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute describes the credential the caller is holding.
//
// The token id comes from the principal, which got it from the signed JWT, so
// this endpoint cannot be pointed at another credential: there is no path
// parameter to point with.
func (h *UseCase) Execute(ctx context.Context) (schema.PlatformCredential, error) {
	caller, ok := principal.FromContext(ctx)
	if !ok || !caller.IsPlatform() {
		// Unreachable through the router -- the endpoint resolves a caller.Platform
		// before calling the facade, and the facade binds a platform principal --
		// but stated here so the handler is safe to call from anywhere, and so a
		// future registration mistake fails closed instead of dereferencing a nil
		// principal.
		return schema.PlatformCredential{}, apierrors.Forbidden(
			"PlatformCredential.WrongCredentialKind",
			"this operation requires a platform credential",
		)
	}

	row, err := h.deps.Queries.GetPlatformTokenByID(ctx, caller.PlatformTokenID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// The credential authenticated seconds ago, so the row was live then.
			// Gone now means revoked and pruned between the two, and 401 is the
			// honest answer: the credential the caller is asking about no longer
			// authenticates anything.
			return schema.PlatformCredential{}, apierrors.Unauthorized(
				"PlatformCredential.Revoked",
				"the calling credential is no longer active",
			)
		}
		return schema.PlatformCredential{}, fmt.Errorf("failed to read the calling platform credential: %w", err)
	}

	return schema.PlatformCredential{
		ID:             row.ID,
		Name:           row.Name,
		Slug:           row.Slug,
		Subject:        platformidentity.ExternalID,
		CredentialKind: string(principal.KindPlatform),
		Scopes:         row.Scopes,
		ExpiresAt:      pgtime.PgTimeStampToTimePtr(row.ExpiresAt),
		CreatedAt:      row.CreatedAt.Time,
	}, nil
}
