// Package updaterole implements its Core user operation.
package updaterole

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/management"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
)

type UseCase struct{ management *management.UseCase }

func NewUseCase(m *management.UseCase) *UseCase { return &UseCase{management: m} }
func (u *UseCase) Execute(ctx context.Context, orgID, actorID uuid.UUID, slug string, input schema.RoleDefinition) (schema.Role, error) {
	return u.management.UpdateRole(ctx, orgID, actorID, slug, input)
}
