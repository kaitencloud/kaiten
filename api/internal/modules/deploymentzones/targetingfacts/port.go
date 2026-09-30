// Package targetingfacts is the deploymentzones module's public read port
// for feature-flag targeting: resolving a deployment zone by (org, slug)
// for the OFREP evaluation-context enrichment flow. Consumed by
// featureflags/openfeature/ofrep instead of reaching into this module's
// own generated db package directly.
package targetingfacts

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
)

// DeploymentZone is the subset of deployment zone fields a targeting rule
// can reference.
type DeploymentZone struct {
	ID        uuid.UUID
	Name      string
	Slug      string
	Type      string
	Metadata  []byte
	ReleaseID uuid.UUID
}

type Port interface {
	GetOneBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*DeploymentZone, error)
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

func (p *port) GetOneBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*DeploymentZone, error) {
	row, err := p.queries.GetOneDeploymentZoneBySlug(ctx, db.GetOneDeploymentZoneBySlugParams{OrganizationID: organizationID, Slug: slug})
	if err != nil {
		return nil, err
	}
	return &DeploymentZone{
		ID:        row.ID,
		Name:      row.Name,
		Slug:      row.Slug,
		Type:      row.Type,
		Metadata:  row.Metadata,
		ReleaseID: row.ReleaseID,
	}, nil
}
