// Package releaselink is the deploymentzones module's public read port for
// the release<->deployment-zone relationships the releases module's GraphQL
// layer needs (which deployment zones and deployments are associated with a
// set of releases) -- consumed instead of releases reaching into this
// module's own generated db package directly.
package releaselink

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// Port is the subset of deploymentzones' persistence releases needs.
type Port interface {
	GetDeploymentZonesByReleaseIDs(ctx context.Context, releaseIDs []uuid.UUID, organizationID uuid.UUID) (map[uuid.UUID][]deploymentzoneschema.DeploymentZone, error)
	GetDeploymentsByReleaseIDs(ctx context.Context, releaseIDs []uuid.UUID, organizationID uuid.UUID) (map[uuid.UUID][]deploymentzoneschema.Deployment, error)
}

type port struct {
	queries *db.Queries
}

// New builds a Port bound to the given pool. Reads never need to join a
// caller's transaction, so this binds to the pool directly rather than
// taking a uow.DBTX.
func New(pool *pgxpool.Pool) Port {
	return &port{queries: db.New(pool)}
}

func (p *port) GetDeploymentZonesByReleaseIDs(ctx context.Context, releaseIDs []uuid.UUID, organizationID uuid.UUID) (map[uuid.UUID][]deploymentzoneschema.DeploymentZone, error) {
	rows, err := p.queries.GetDeploymentZonesByReleaseIDs(ctx, db.GetDeploymentZonesByReleaseIDsParams{
		OrganizationID: organizationID,
		ReleaseIds:     releaseIDs,
	})
	if err != nil {
		return nil, err
	}

	grouped := make(map[uuid.UUID][]deploymentzoneschema.DeploymentZone, len(releaseIDs))
	for _, row := range rows {
		var metadata map[string]interface{}
		if len(row.Metadata) > 0 {
			if err := json.Unmarshal(row.Metadata, &metadata); err != nil {
				return nil, err
			}
		}

		currentReleaseID := row.CurrentReleaseID
		grouped[row.ReleaseID] = append(grouped[row.ReleaseID], deploymentzoneschema.DeploymentZone{
			ID:          row.ID,
			Name:        row.Name,
			Slug:        row.Slug,
			Type:        row.Type,
			Metadata:    metadata,
			Description: row.Description,
			ReleaseID:   &currentReleaseID,
			CreatedBy:   shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:   row.CreatedAt.Time,
			UpdatedBy:   shared.User{ID: row.UpdatedByID, Name: row.UpdatedByName},
			UpdatedAt:   row.UpdatedAt.Time,
		})
	}
	return grouped, nil
}

func (p *port) GetDeploymentsByReleaseIDs(ctx context.Context, releaseIDs []uuid.UUID, organizationID uuid.UUID) (map[uuid.UUID][]deploymentzoneschema.Deployment, error) {
	rows, err := p.queries.GetDeploymentsByReleaseIDs(ctx, db.GetDeploymentsByReleaseIDsParams{
		OrganizationID: organizationID,
		ReleaseIds:     releaseIDs,
	})
	if err != nil {
		return nil, err
	}

	grouped := make(map[uuid.UUID][]deploymentzoneschema.Deployment, len(releaseIDs))
	for _, row := range rows {
		grouped[row.ReleaseID] = append(grouped[row.ReleaseID], deploymentzoneschema.Deployment{
			ID:               row.ID,
			DeploymentZoneID: row.DeploymentZoneID,
			ReleaseID:        row.ReleaseID,
			CreatedBy:        shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:        row.CreatedAt.Time,
		})
	}
	return grouped, nil
}
