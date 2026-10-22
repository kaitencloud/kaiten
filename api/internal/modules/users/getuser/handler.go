package getuser

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/management"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
)

type UseCase struct{ management *management.UseCase }

func NewUseCase(m *management.UseCase) *UseCase { return &UseCase{management: m} }
func (u *UseCase) Execute(ctx context.Context, orgID, actorID uuid.UUID, id uuid.UUID) (schema.ManagedUser, error) {
	return u.management.Get(ctx, orgID, actorID, id)
}
