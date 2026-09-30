package graphql

import (
	"encoding/json"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

func toDeploymentZoneSchema(row db.GetDeploymentZonesByIDsRow) (deploymentzoneschema.DeploymentZone, error) {
	var metadata map[string]interface{}
	if len(row.Metadata) > 0 {
		if err := json.Unmarshal(row.Metadata, &metadata); err != nil {
			return deploymentzoneschema.DeploymentZone{}, err
		}
	}

	return deploymentzoneschema.DeploymentZone{
		ID:          row.ID,
		Name:        row.Name,
		Slug:        row.Slug,
		Type:        row.Type,
		Metadata:    metadata,
		Description: row.Description,
		ReleaseID:   nullableUUID(row.ReleaseID),
		CreatedBy:   shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
		CreatedAt:   row.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: row.UpdatedByID, Name: row.UpdatedByName},
		UpdatedAt:   row.UpdatedAt.Time,
	}, nil
}

func nullableUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}
