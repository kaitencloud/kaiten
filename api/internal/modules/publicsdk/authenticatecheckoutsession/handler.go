// Package authenticatecheckoutsession resolves an anonymous checkout
// session's ksc_ for the public surface's authenticator
// (auth.PublicMiddleware, V32-01).
//
// Like authenticatecustomersession it appears on no surface of its own:
// authentication precedes a caller, so it cannot go through the facade.
package authenticatecheckoutsession

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

// Deps is what the lookup reads.
type Deps struct {
	Uof *uow.UnitOfWork
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// AuthenticateCheckoutSession looks the ksc_ up by digest on every request,
// with no cache: a revoked key, or a read window that ended, applies to the
// very next request. ok = false for every token that does not authenticate,
// whatever the reason.
func (u *UseCase) AuthenticateCheckoutSession(ctx context.Context, plainToken string) (principal.CheckoutSession, bool, error) {
	row, err := db.New(u.deps.Uof.DBTX(ctx)).AuthenticateCheckoutSession(ctx, token.LookupHash(plainToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return principal.CheckoutSession{}, false, nil
	}
	if err != nil {
		return principal.CheckoutSession{}, false, err
	}
	origins := row.AllowedOrigins
	if origins == nil {
		origins = []string{}
	}
	return principal.CheckoutSession{
		ID: row.ID, OrganizationID: row.OrganizationID, PublishableKeyID: row.PublishableKeyID, AllowedOrigins: origins,
	}, true, nil
}
