// Package catalogue is the entitlements module's public read port for
// listing every entitlement slug an organization has declared. Consumed by
// featureflags (to lint a targeting rule's entitlement references at write
// time) instead of reaching into this module's own generated db package
// directly.
package catalogue

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
)

type Port interface {
	ListSlugs(ctx context.Context, organizationID uuid.UUID) ([]string, error)
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

func (p *port) ListSlugs(ctx context.Context, organizationID uuid.UUID) ([]string, error) {
	entitlements, err := p.queries.GetEntitlements(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	slugs := make([]string, 0, len(entitlements))
	for _, entitlement := range entitlements {
		slugs = append(slugs, entitlement.Slug)
	}
	return slugs, nil
}
