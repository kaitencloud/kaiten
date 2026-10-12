// Package catalogue is the entitlements module's public read port for
// listing every entitlement an organization has declared, with its type.
// Consumed by featureflags (to lint a targeting rule's entitlement references
// at write time, and to describe them to the rule editor) instead of reaching
// into this module's own generated db package directly.
package catalogue

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// Entitlement is one declared entitlement: the slug a rule reads it under,
// and the type that decides the shape it reads in.
type Entitlement struct {
	Slug string
	Type schema.Type
}

type Port interface {
	List(ctx context.Context, organizationID uuid.UUID) ([]Entitlement, error)
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

func (p *port) List(ctx context.Context, organizationID uuid.UUID) ([]Entitlement, error) {
	rows, err := p.queries.GetEntitlements(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	entitlements := make([]Entitlement, 0, len(rows))
	for _, row := range rows {
		entitlements = append(entitlements, Entitlement{Slug: row.Slug, Type: schema.Type(row.Type)})
	}

	return entitlements, nil
}
