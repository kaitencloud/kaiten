package graphql

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// LicenseAddonGrantsLoaderName loads License.addonGrants, by licence family.
const LicenseAddonGrantsLoaderName = "LicenseAddonGrantsLoader"

// LicenseAddonGrant is an entitlement an add-on version grants on the
// licences it fits, the model of the schema's LicenseAddonGrant.
//
// An add-on attaches to an instance, and what ties it to a licence is
// compatibility, declared per add-on version against a licence family
// (addon_compatible_license). So this is what an instance of the licence CAN
// be granted by attaching the add-on, the same for every version of the
// family; it says nothing of what any instance holds.
type LicenseAddonGrant struct {
	EntitlementSlug                string
	EntitlementType                string
	AddonID                        uuid.UUID
	AddonSlug                      string
	AddonFamilySlug                string
	AddonName                      string
	AddonVersion                   int32
	LifecycleState                 string
	IsDefault                      bool
	MaxQuantity                    *int32
	Value                          map[string]any
	Unlimited                      bool
	LimitCapExceededOveragePercent *int32
	OverrideBehavior               string
}

// newLicenseAddonGrantsBatchFn reads, in one statement, what add-ons grant on
// every licence family a batch names. An AI credit pool is left out while AI
// usage is off for the organization, as the REST list of an add-on's
// entitlements leaves it out (aiusage.Policy.RequireType).
func newLicenseAddonGrantsBatchFn(queries *db.Queries, policy aiusage.Policy) dataloaderLib.BatchFunc[uuid.UUID, []LicenseAddonGrant] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]LicenseAddonGrant] {
		results := make([]*dataloaderLib.Result[[]LicenseAddonGrant], len(keys))
		fail := func(err error) []*dataloaderLib.Result[[]LicenseAddonGrant] {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]LicenseAddonGrant]{Error: err}
			}
			return results
		}

		i, ok := principal.FromContext(ctx)
		if !ok {
			return fail(dataloader.ErrMissingIdentity)
		}
		rows, err := queries.ListAddonGrantsByLicenseFamilies(ctx, db.ListAddonGrantsByLicenseFamiliesParams{
			OrganizationID: i.OrganizationID, LicenseFamilyIds: keys,
		})
		if err != nil {
			return fail(err)
		}

		byFamily := map[uuid.UUID][]LicenseAddonGrant{}
		for _, row := range rows {
			if policy.RequireType(ctx, string(row.EntitlementType)) != nil {
				continue
			}
			grant, err := toLicenseAddonGrant(row)
			if err != nil {
				return fail(err)
			}
			byFamily[row.LicenseFamilyID] = append(byFamily[row.LicenseFamilyID], grant)
		}
		for n, key := range keys {
			grants := byFamily[key]
			if grants == nil {
				grants = []LicenseAddonGrant{}
			}
			results[n] = &dataloaderLib.Result[[]LicenseAddonGrant]{Data: grants}
		}
		return results
	}
}

func toLicenseAddonGrant(row db.ListAddonGrantsByLicenseFamiliesRow) (LicenseAddonGrant, error) {
	value := map[string]any{}
	if err := json.Unmarshal(row.Value, &value); err != nil {
		return LicenseAddonGrant{}, err
	}
	var overage *int32
	if row.LimitCapExceededOveragePercent != nil {
		percent := int32(*row.LimitCapExceededOveragePercent)
		overage = &percent
	}
	return LicenseAddonGrant{
		EntitlementSlug: row.EntitlementSlug, EntitlementType: string(row.EntitlementType),
		AddonID: row.AddonID, AddonSlug: row.AddonSlug, AddonFamilySlug: row.AddonFamilySlug, AddonName: row.AddonName,
		AddonVersion: row.AddonVersion, LifecycleState: string(row.LifecycleState), IsDefault: row.IsDefault, MaxQuantity: row.MaxQuantity,
		Value: value, Unlimited: entitlementvalue.IsUnlimitedValue(value),
		LimitCapExceededOveragePercent: overage, OverrideBehavior: string(row.OverrideBehavior),
	}, nil
}

// LoadLicenseAddonGrants is what add-ons can grant on the licences of a
// family, in entitlement then add-on order; entitlementSlug narrows it to one
// entitlement. The slice is never nil.
func LoadLicenseAddonGrants(ctx context.Context, licenseFamilyID uuid.UUID, entitlementSlug *string) ([]LicenseAddonGrant, error) {
	loader, err := dataloader.GetLoader[uuid.UUID, []LicenseAddonGrant](dataloader.LoadersFromContext(ctx), LicenseAddonGrantsLoaderName)
	if err != nil {
		return nil, err
	}
	grants, err := loader.Load(ctx, licenseFamilyID)()
	if err != nil {
		return nil, err
	}
	if entitlementSlug == nil {
		return grants, nil
	}
	narrowed := make([]LicenseAddonGrant, 0, len(grants))
	for _, grant := range grants {
		if grant.EntitlementSlug == *entitlementSlug {
			narrowed = append(narrowed, grant)
		}
	}
	return narrowed, nil
}
