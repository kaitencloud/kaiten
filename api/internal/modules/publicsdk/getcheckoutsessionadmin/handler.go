// Package getcheckoutsessionadmin is GET /checkout-sessions/{sessionId}
// (§13.18): one anonymous checkout as the vendor reads it.
package getcheckoutsessionadmin

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	deps       keys.Deps
	activation createcheckoutsession.Activation
}

func NewUseCase(deps keys.Deps, activation createcheckoutsession.Activation) *UseCase {
	return &UseCase{deps: deps, activation: activation}
}

// Execute reads one session of the caller's organization. Another's, or one
// deleted 90 days after it closed, is not found.
func (u *UseCase) Execute(ctx context.Context, sessionID uuid.UUID) (*checkout.CheckoutSessionAdmin, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	row, err := u.deps.Queries(ctx).GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: user.OrganizationID, ID: sessionID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.NotFoundf("GetCheckoutSessionAdmin.NotFound", "checkout session %s not found", sessionID)
	}
	if err != nil {
		return nil, err
	}
	return getcheckoutsession.Admin(ctx, u.activation, row)
}
