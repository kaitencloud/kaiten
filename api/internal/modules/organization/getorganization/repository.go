package getorganization

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetOrganization(ctx context.Context, organizationID uuid.UUID) (*organizationschema.Organization, error) {
	result, err := r.repository.GetOrganization(ctx, organizationID)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			return nil, kaitenerrors.NotFound("GetAllOrganizations.OrganizationNotFound", "Organization not found")
		default:
			return nil, err
		}
	}
	return &organizationschema.Organization{
		ID:         result.ID,
		ExternalID: result.ExternalID,
		Name:       result.Name,
	}, nil
}
