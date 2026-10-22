// Package resolveauthorization resolves current human grants independently of authentication.
package resolveauthorization

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Reader interface {
	ResolveGrants(context.Context, uuid.UUID, uuid.UUID) ([]string, error)
}
type UseCase struct{ reader Reader }

func NewUseCase(reader Reader) *UseCase { return &UseCase{reader: reader} }

func (u *UseCase) Resolve(ctx context.Context, orgID, userID uuid.UUID) ([]string, error) {
	grants, err := u.reader.ResolveGrants(ctx, orgID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apierrors.Forbidden("Auth.UserAccessDenied", "User is not an active member of the organization")
	}
	if errors.Is(err, storage.ErrInvalidAuthorization) {
		return nil, apierrors.Forbidden("Auth.InvalidAssignments", "Stored authorization is invalid")
	}
	if err != nil {
		return nil, err
	}
	return grants, nil
}
