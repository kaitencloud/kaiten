package seedkit

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementgroup"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// SeedEntitlementGroups creates each group via the CreateEntitlementGroup use case.
func SeedEntitlementGroups(ctx context.Context, sc *seeder.SeederContext, groups []EntitlementGroupDef) error {
	for _, group := range groups {
		if _, err := sc.Entitlements.CreateEntitlementGroup.Execute(ctx, &createentitlementgroup.Command{
			Name: group.Name,
			Slug: ptr.To(group.Slug),
		}); err != nil {
			return fmt.Errorf("create entitlement group %q: %w", group.Slug, err)
		}
	}
	return nil
}

// SeededEntitlements holds the lookup maps returned after seeding entitlements,
// keyed by the requested slug.
type SeededEntitlements struct {
	IDs   map[string]uuid.UUID              // requested slug -> created ID
	Slugs map[string]string                 // requested slug -> created slug
	Types map[string]entitlementschema.Type // requested slug -> type
}

// SeedEntitlements creates each entitlement via the CreateEntitlement use case
// and returns ID/slug/type lookup maps. AggregationMethod is only sent for
// Number entitlements.
func SeedEntitlements(ctx context.Context, sc *seeder.SeederContext, defs []EntitlementDef) (SeededEntitlements, error) {
	result := SeededEntitlements{
		IDs:   make(map[string]uuid.UUID, len(defs)),
		Slugs: make(map[string]string, len(defs)),
		Types: make(map[string]entitlementschema.Type, len(defs)),
	}
	for _, ent := range defs {
		var aggregationMethod *entitlementschema.AggregationMethod
		if ent.Type == entitlementschema.Number {
			aggregationMethod = ptr.To(ent.AggregationMethod)
		}

		created, err := sc.Entitlements.CreateEntitlement.Execute(ctx, &createentitlement.Command{
			Name:              ent.Name,
			Slug:              ptr.To(ent.Slug),
			Description:       ptr.To(ent.Description),
			GroupSlugs:        ent.GroupSlugs,
			Type:              ent.Type,
			AggregationMethod: aggregationMethod,
		})
		if err != nil {
			return SeededEntitlements{}, fmt.Errorf("create entitlement %q: %w", ent.Slug, err)
		}
		result.IDs[ent.Slug] = created.ID
		result.Slugs[ent.Slug] = created.Slug
		result.Types[ent.Slug] = ent.Type
	}
	return result, nil
}
