// Package sourcerefs loads the sources a combined entitlement names, to embed
// them in its payload, as grouprefs does for its groups.
package sourcerefs

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

type Reader interface {
	ListCombinedSources(ctx context.Context, arg db.ListCombinedSourcesParams) ([]db.ListCombinedSourcesRow, error)
}

// Attach sets the sources of entitlement when it is a combined one; any other
// entitlement has none to look for.
func Attach(ctx context.Context, reader Reader, entitlement *schema.Entitlement, organizationID uuid.UUID) error {
	if entitlement.UsageSource == nil || *entitlement.UsageSource != schema.CombinedUsage {
		return nil
	}

	rows, err := reader.ListCombinedSources(ctx, db.ListCombinedSourcesParams{
		OrganizationID: organizationID,
		CombinedSlug:   &entitlement.Slug,
	})
	if err != nil {
		return err
	}

	entitlement.Sources = dbmap.ToEntitlementSources(rows)

	return nil
}

// ByCombinedSlug is the sources of every combined entitlement of the
// organization, by the combined entitlement's slug: one lookup for a whole
// list, not one per entitlement.
func ByCombinedSlug(ctx context.Context, reader Reader, organizationID uuid.UUID) (map[string][]schema.EntitlementSource, error) {
	rows, err := reader.ListCombinedSources(ctx, db.ListCombinedSourcesParams{OrganizationID: organizationID, CombinedSlug: nil})
	if err != nil {
		return nil, err
	}

	bySlug := make(map[string][]schema.EntitlementSource)
	for _, row := range rows {
		bySlug[row.CombinedSlug] = append(bySlug[row.CombinedSlug], schema.EntitlementSource{
			EntitlementSlug: row.SourceSlug, Weight: row.Weight,
		})
	}

	return bySlug, nil
}
