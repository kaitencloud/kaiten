package listusers

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/management"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type UseCase struct{ management *management.UseCase }

func NewUseCase(m *management.UseCase) *UseCase { return &UseCase{management: m} }
func (u *UseCase) Execute(ctx context.Context, orgID, actorID uuid.UUID, limit int32, cursor *string) (pagination.Page[schema.ManagedUser], error) {
	return u.management.List(ctx, orgID, actorID, limit, cursor)
}
