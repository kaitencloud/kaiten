// Package resolveauthorization resolves current human grants independently of authentication.
package resolveauthorization

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Reader interface {
	Resolve(context.Context, uuid.UUID, uuid.UUID) (schema.UserAuthorization, error)
}
type UseCase struct{ reader Reader }

func NewUseCase(reader Reader) *UseCase { return &UseCase{reader: reader} }

func (u *UseCase) Resolve(ctx context.Context, orgID, userID uuid.UUID) ([]string, error) {
	assignment, err := u.reader.Resolve(ctx, orgID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apierrors.Forbidden("Auth.UserAccessDenied", "User is not an active member of the organization")
	}
	if err != nil {
		return nil, err
	}
	if err := assignment.Validate(); err != nil {
		return nil, apierrors.Forbidden("Auth.InvalidAssignments", "Stored authorization is invalid")
	}
	return assignment.EffectiveScopes(), nil
}
