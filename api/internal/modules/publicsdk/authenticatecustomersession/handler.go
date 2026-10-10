// Package authenticatecustomersession resolves a customer session for the
// public surface's authenticator (auth.PublicMiddleware).
//
// Like authenticatepublishablekey it appears on no surface of its own:
// authentication precedes a caller, so it cannot go through the facade.
package authenticatecustomersession

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

type UseCase struct{ deps sessions.Deps }

func NewUseCase(deps sessions.Deps) *UseCase { return &UseCase{deps: deps} }

// AuthenticateCustomerSession looks the session up by digest on every request
// -- no cache, so a revocation applies to the very next request on every
// replica -- and answers what it is bound to, its organization, and who minted
// it.
func (u *UseCase) AuthenticateCustomerSession(ctx context.Context, plainToken string) (
	principal.CustomerSession, uuid.UUID, uuid.UUID, bool, error,
) {
	row, err := u.deps.Queries(ctx).AuthenticateCustomerSession(ctx, token.LookupHash(plainToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return principal.CustomerSession{}, uuid.Nil, uuid.Nil, false, nil
	}
	if err != nil {
		return principal.CustomerSession{}, uuid.Nil, uuid.Nil, false, err
	}
	origins := row.AllowedOrigins
	if origins == nil {
		origins = []string{}
	}
	return principal.CustomerSession{
		ID: row.ID, CustomerID: row.CustomerID, CustomerSlug: row.CustomerSlug,
		InstanceID: row.InstanceID, InstanceSlug: row.InstanceSlug, AllowedOrigins: origins,
	}, row.OrganizationID, row.CreatedByID, true, nil
}
