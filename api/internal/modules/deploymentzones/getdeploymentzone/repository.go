package getdeploymentzone

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	deploymentZoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
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

func (r *QueryRepository) GetDeploymentZoneBySlug(ctx context.Context, slug string, organizationID uuid.UUID) (*deploymentZoneschema.DeploymentZone, error) {
	params := db.GetOneDeploymentZoneBySlugParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	dz, err := r.repository.GetOneDeploymentZoneBySlug(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFoundf("DeploymentZone.NotFound", "DeploymentZone with slug %q not found in organization %s", slug, organizationID)
		}
		return nil, err
	}

	var metadata map[string]interface{}
	_ = json.Unmarshal(dz.Metadata, &metadata)

	return &deploymentZoneschema.DeploymentZone{
		ID:          dz.ID,
		Name:        dz.Name,
		Slug:        dz.Slug,
		Type:        dz.Type,
		Metadata:    metadata,
		Description: dz.Description,
		CreatedBy:   shared.User{ID: dz.CreatedByID, Name: dz.CreatedByName},
		CreatedAt:   dz.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: dz.UpdatedByID, Name: dz.UpdatedByName},
		UpdatedAt:   dz.UpdatedAt.Time,
		ReleaseID:   nullableUUID(dz.ReleaseID),
	}, nil
}

// nullableUUID converts a sqlc-generated non-nullable uuid.UUID (where the zero
// value represents SQL NULL from a LEFT JOIN) to a *uuid.UUID.
func nullableUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}
