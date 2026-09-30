package getorganization

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
)

type UseCase struct {
	repository *QueryRepository
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{repository: NewQueryRepository(queries)}
}

func (h *UseCase) Execute(ctx context.Context, organizationID uuid.UUID) (*schema.Organization, error) {
	return h.repository.GetOrganization(ctx, organizationID)
}
