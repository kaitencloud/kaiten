package revokecustomersession

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "RevokeCustomerSession"

type UseCase struct{ deps sessions.Deps }

func NewUseCase(deps sessions.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute revokes a session: it stops authenticating on the next request, as
// sessions are looked up on every request. Revoking twice is a no-op.
func (u *UseCase) Execute(ctx context.Context, sessionID uuid.UUID) error {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return err
	}
	_, err = u.deps.Queries(ctx).RevokeCustomerSession(ctx, db.RevokeCustomerSessionParams{
		ActorID: user.ID, OrganizationID: user.OrganizationID, ID: sessionID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return kaitenerrors.NotFoundf(operation+".NotFound", "customer session %s not found", sessionID)
	}
	return err
}
