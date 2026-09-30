package getdeploymentzones

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	deploymentZoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

// nullableUUID converts a sqlc-generated non-nullable uuid.UUID (where the zero
// value represents SQL NULL from a LEFT JOIN) to a *uuid.UUID so that callers
// can distinguish "no deployment" (nil) from an actual release ID.
func nullableUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func (r *QueryRepository) GetDeploymentZones(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*deploymentZoneschema.DeploymentZone, error) {
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	result, err := r.repository.GetDeploymentZonesByCursor(ctx, db.GetDeploymentZonesByCursorParams{
		OrganizationID:  organizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	deploymentZones := make([]*deploymentZoneschema.DeploymentZone, 0, len(result))

	for _, dz := range result {
		var metadata map[string]interface{}
		_ = json.Unmarshal(dz.Metadata, &metadata)
		deploymentZones = append(deploymentZones, &deploymentZoneschema.DeploymentZone{
			ID:          dz.ID,
			Name:        dz.Name,
			Slug:        dz.Slug,
			Type:        dz.Type,
			Metadata:    metadata,
			Description: dz.Description,
			ReleaseID:   nullableUUID(dz.ReleaseID),
			CreatedBy:   shared.User{ID: dz.CreatedByID, Name: dz.CreatedByName},
			CreatedAt:   dz.CreatedAt.Time,
			UpdatedBy:   shared.User{ID: dz.UpdatedByID, Name: dz.UpdatedByName},
			UpdatedAt:   dz.UpdatedAt.Time,
		})
	}

	return deploymentZones, nil
}
