// Package deleterole implements its Core user operation.
package deleterole

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/management"
)

type UseCase struct{ management *management.UseCase }

func NewUseCase(m *management.UseCase) *UseCase { return &UseCase{management: m} }
func (u *UseCase) Execute(ctx context.Context, orgID, actorID uuid.UUID, slug string) error {
	return u.management.DeleteRole(ctx, orgID, actorID, slug)
}
