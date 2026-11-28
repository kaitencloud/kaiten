package catalogue

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
)

// CombinedSource is one source of a combined entitlement, with the weight its
// usage counts at.
type CombinedSource struct {
	Slug   string
	Weight decimal.Decimal
}

// Combined is a combined entitlement (usageSource COMBINED_USAGE) and what it
// sums: the weighted sum of the usage of its sources, computed by whoever reads
// it, since nothing is stored for it.
type Combined struct {
	ID      uuid.UUID
	Slug    string
	Sources []CombinedSource
}

// CombinedReader lists the combined entitlements an organization has declared.
// It is a port of its own, not a method of Port: the readers of an instance's
// usage need it, and a featureflags fake implements Port.
type CombinedReader interface {
	Combined(ctx context.Context, organizationID uuid.UUID) ([]Combined, error)
}

type combinedReader struct {
	queries *db.Queries
}

// NewCombined builds a CombinedReader bound to the given pool, as New does.
func NewCombined(pool *pgxpool.Pool) CombinedReader {
	return &combinedReader{queries: db.New(pool)}
}

func (r *combinedReader) Combined(ctx context.Context, organizationID uuid.UUID) ([]Combined, error) {
	rows, err := r.queries.ListCombinedSources(ctx, db.ListCombinedSourcesParams{OrganizationID: organizationID, CombinedSlug: nil})
	if err != nil {
		return nil, err
	}

	// The rows come grouped by combined entitlement: one lookup for the whole
	// organization, bounded by how many sources there are.
	var combined []Combined
	for _, row := range rows {
		weight, err := decimal.NewFromString(row.Weight)
		if err != nil {
			return nil, fmt.Errorf("weight of source %q of combined entitlement %q: %w", row.SourceSlug, row.CombinedSlug, err)
		}
		if len(combined) == 0 || combined[len(combined)-1].ID != row.CombinedID {
			combined = append(combined, Combined{ID: row.CombinedID, Slug: row.CombinedSlug})
		}
		last := &combined[len(combined)-1]
		last.Sources = append(last.Sources, CombinedSource{Slug: row.SourceSlug, Weight: weight})
	}

	return combined, nil
}
