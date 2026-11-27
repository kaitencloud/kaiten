// Package catalogue is the deploymentzones module's public read port for
// listing every deployment zone an organization has. Consumed by featureflags,
// to describe them to the targeting rule editor and to lint a rule's comparison
// with a zone's slug at write time, instead of reaching into this module's own
// generated db package directly.
package catalogue

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
)

// Zone is one deployment zone: the slug a rule compares it by, and the name an
// author recognises it with.
type Zone struct {
	Slug string
	Name string
}

type Port interface {
	List(ctx context.Context, organizationID uuid.UUID) ([]Zone, error)
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

func (p *port) List(ctx context.Context, organizationID uuid.UUID) ([]Zone, error) {
	rows, err := p.queries.GetDeploymentZones(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	zones := make([]Zone, 0, len(rows))
	for _, row := range rows {
		zones = append(zones, Zone{Slug: row.Slug, Name: row.Name})
	}

	return zones, nil
}
