// Package authenticatepublishablekey resolves a publishable key for the public
// surface's authenticator (auth.PublishableKeyMiddleware).
//
// Like identity's validatetoken it appears on no surface of its own:
// authentication precedes a caller, so it cannot go through the facade.
package authenticatepublishablekey

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

type UseCase struct{ deps keys.Deps }

func NewUseCase(deps keys.Deps) *UseCase { return &UseCase{deps: deps} }

// AuthenticatePublishableKey looks the key up by digest on every request --
// there is no cache, so a revocation or an origin change applies to the very
// next request on every replica. The lookup is answered from one index.
func (u *UseCase) AuthenticatePublishableKey(ctx context.Context, plainKey string) (
	keyID, organizationID uuid.UUID, allowedOrigins []string, ok bool, err error,
) {
	q := u.deps.Queries(ctx)
	row, err := q.AuthenticatePublishableKey(ctx, token.LookupHash(plainKey))
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, uuid.Nil, nil, false, nil
	}
	if err != nil {
		return uuid.Nil, uuid.Nil, nil, false, err
	}
	// last_used_at is advisory: a failed write must not fail the read it
	// describes.
	if err := q.TouchPublishableKey(ctx, row.ID); err != nil {
		slog.WarnContext(ctx, "publicsdk: could not record a publishable key's use", "error", err)
	}
	return row.ID, row.OrganizationID, row.AllowedOrigins, true, nil
}
