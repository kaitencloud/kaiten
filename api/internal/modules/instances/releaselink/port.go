// Package releaselink is the instances module's public read port for the
// release<->instance relationships the releases module's GraphQL layer
// needs (which instances are running a set of releases) -- consumed
// instead of releases reaching into this module's own generated db package
// directly.
package releaselink

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// Port is the subset of instances' persistence releases needs.
type Port interface {
	GetInstancesByReleaseIDs(ctx context.Context, releaseIDs []uuid.UUID, organizationID uuid.UUID) (map[uuid.UUID][]instanceschema.Instance, error)
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

func (p *port) GetInstancesByReleaseIDs(ctx context.Context, releaseIDs []uuid.UUID, organizationID uuid.UUID) (map[uuid.UUID][]instanceschema.Instance, error) {
	rows, err := p.queries.GetInstancesByReleaseIDs(ctx, db.GetInstancesByReleaseIDsParams{
		OrganizationID: organizationID,
		ReleaseIds:     releaseIDs,
	})
	if err != nil {
		return nil, err
	}

	grouped := make(map[uuid.UUID][]instanceschema.Instance, len(releaseIDs))
	for _, row := range rows {
		metadata, err := instanceschema.UnmarshalJSONObject(row.Metadata)
		if err != nil {
			return nil, err
		}

		licenseSlug := ""
		if row.LicenseSlug != nil {
			licenseSlug = *row.LicenseSlug
		}

		customerSlug := ""
		if row.CustomerSlug != nil {
			customerSlug = *row.CustomerSlug
		}

		grouped[row.ReleaseID] = append(grouped[row.ReleaseID], instanceschema.Instance{
			ID:                 row.ID,
			Slug:               row.Slug,
			Name:               row.Name,
			Description:        row.Description,
			CreatedBy:          shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:          row.CreatedAt.Time,
			UpdatedBy:          shared.User{ID: row.UpdatedByID, Name: row.UpdatedByName},
			UpdatedAt:          row.UpdatedAt.Time,
			Status:             instanceschema.InstanceStatus(row.Status),
			LifecycleStage:     row.LifecycleStage,
			CustomerID:         row.CustomerID,
			CustomerSlug:       customerSlug,
			LicenseID:          row.LicenseID,
			LicenseSlug:        licenseSlug,
			DeploymentZoneID:   row.DeploymentZoneID,
			DeploymentZoneSlug: row.DeploymentZoneSlug,
			StartLicenseDate:   row.StartLicenseDate.Time,
			EndLicenseDate:     row.EndLicenseDate.Time,
			Metadata:           metadata,
		})
	}
	return grouped, nil
}
