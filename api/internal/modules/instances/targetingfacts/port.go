// Package targetingfacts is the instances module's public read port for
// feature-flag targeting: resolving an instance's own registry facts by
// slug or by a set of IDs, for the OFREP evaluation-context enrichment
// flow. Consumed by featureflags/openfeature/ofrep instead of reaching
// into this module's own generated db package directly.
package targetingfacts

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// Instance is the subset of instance fields a targeting rule can reference,
// plus the owning customer/deployment-zone slugs needed to enrich those
// facts too.
type Instance struct {
	ID                 uuid.UUID
	Slug               string
	Name               string
	Status             string
	LifecycleStage     *string
	Metadata           []byte
	CustomerSlug       *string
	DeploymentZoneSlug *string
}

type Port interface {
	GetOneBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*Instance, error)
	GetByIDs(ctx context.Context, organizationID uuid.UUID, ids []uuid.UUID) ([]Instance, error)
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

func (p *port) GetOneBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*Instance, error) {
	row, err := p.queries.GetOneInstance(ctx, db.GetOneInstanceParams{OrganizationID: organizationID, Slug: slug})
	if err != nil {
		return nil, err
	}
	return &Instance{
		ID: row.ID, Slug: row.Slug, Name: row.Name, Status: string(row.Status),
		LifecycleStage: row.LifecycleStage, Metadata: row.Metadata,
		CustomerSlug: row.CustomerSlug, DeploymentZoneSlug: row.DeploymentZoneSlug,
	}, nil
}

func (p *port) GetByIDs(ctx context.Context, organizationID uuid.UUID, ids []uuid.UUID) ([]Instance, error) {
	rows, err := p.queries.GetInstancesByIDs(ctx, db.GetInstancesByIDsParams{OrganizationID: organizationID, InstanceIds: ids})
	if err != nil {
		return nil, err
	}
	instances := make([]Instance, len(rows))
	for i, row := range rows {
		instances[i] = Instance{
			ID: row.ID, Slug: row.Slug, Name: row.Name, Status: string(row.Status),
			LifecycleStage: row.LifecycleStage, Metadata: row.Metadata,
			CustomerSlug: row.CustomerSlug, DeploymentZoneSlug: row.DeploymentZoneSlug,
		}
	}
	return instances, nil
}
