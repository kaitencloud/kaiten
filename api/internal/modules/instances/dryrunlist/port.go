// Package dryrunlist is the instances module's public read port for
// metadatafields' dry-run endpoint, which needs the (name, slug, metadata)
// of every instance in an org to preview a metadata field's impact before
// it's saved. Consumed instead of metadatafields reaching into this
// module's own generated db package directly.
package dryrunlist

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// Entry is the minimal projection metadatafields' dry-run needs from an
// instance row: a display identity plus its raw metadata jsonb.
type Entry struct {
	Name     string
	Slug     string
	Metadata []byte
}

type Lister struct {
	queries *db.Queries
}

func New(pool *pgxpool.Pool) *Lister {
	return &Lister{queries: db.New(pool)}
}

// List returns every instance in the organization, including deleted ones
// -- matching the dry-run's existing "every resource of this type" scope.
func (l *Lister) List(ctx context.Context, organizationID uuid.UUID) ([]Entry, error) {
	rows, err := l.queries.GetAllInstances(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	entries := make([]Entry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, Entry{Name: row.Name, Slug: row.Slug, Metadata: row.Metadata})
	}
	return entries, nil
}
