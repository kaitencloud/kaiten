// Package setuserassignments implements its Core user operation.
package setuserassignments

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/management"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
)

type UseCase struct{ management *management.UseCase }

func NewUseCase(m *management.UseCase) *UseCase { return &UseCase{management: m} }
func (u *UseCase) Execute(ctx context.Context, orgID, actorID uuid.UUID, id uuid.UUID, input schema.UserRoleAssignments) (schema.UserAuthorization, error) {
	return u.management.SetAssignments(ctx, orgID, actorID, id, input)
}
