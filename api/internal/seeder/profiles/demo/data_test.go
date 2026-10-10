package demo

import (
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
)

func TestEntitlementGroupsCoverAllSampleEntitlements(t *testing.T) {
	groupNamesBySlug := make(map[string]string, len(entitlementGroups))

	for _, group := range entitlementGroups {
		require.NotEmpty(t, group.Name)
		require.NotEmpty(t, group.Slug)
		_, exists := groupNamesBySlug[group.Slug]
		require.Falsef(t, exists, "duplicate entitlement group slug %q", group.Slug)
		groupNamesBySlug[group.Slug] = group.Name
	}

	for _, entitlement := range entitlements {
		require.NotEmptyf(t, entitlement.GroupSlugs, "entitlement %q must belong to at least one group", entitlement.Slug)

		seenGroupSlugs := make(map[string]struct{}, len(entitlement.GroupSlugs))
		for _, groupSlug := range entitlement.GroupSlugs {
			_, exists := seenGroupSlugs[groupSlug]
			require.Falsef(
				t,
				exists,
				"entitlement %q references group %q more than once",
				entitlement.Slug,
				groupSlug,
			)
			seenGroupSlugs[groupSlug] = struct{}{}

			_, exists = groupNamesBySlug[groupSlug]
			require.Truef(
				t,
				exists,
				"entitlement %q references unknown group %q",
				entitlement.Slug,
				groupSlug,
			)
		}
	}
}

// TestUsageRowsFollowTheirEntitlementsResetPeriod guards the window each seeded
// usage row is dated to. A periodic row of a lifetime entitlement claims a
// reset the entitlement does not have, and a lifetime row of a periodic one
// reads as zero. monthly-orders was the first case: its rows were dated to the
// month, from a slug kept beside the definitions, while the entitlement was
// created without a reset period. The row's window now comes from the
// definition (usagePeriodStart), so this checks that derivation on every row
// the dataset reports, and that each definition is one create-entitlement
// accepts -- the database refuses the rest, but only once a seed runs.
func TestUsageRowsFollowTheirEntitlementsResetPeriod(t *testing.T) {
	for _, ent := range entitlements {
		// The check create-entitlement runs, on the anchor as written: the
		// seed computes the window from it, so it does not get the default
		// the API would fill in.
		require.NoErrorf(t,
			entitlementschema.ValidateResetConfiguration(ent.Type, ent.AggregationMethod, ent.ResetPeriod, ent.ResetAnchor),
			"entitlement %q", ent.Slug)
	}

	// The seed runs at any time; the dataset's own "today" will do. Instances
	// start their license when they are seeded, so that is their start too.
	now := datasetReferenceDate
	periodic := 0
	for _, cust := range customers {
		for _, inst := range cust.Instances {
			for slug, usage := range inst.UsageValues {
				require.Containsf(t, usageEntitlementOrder, slug,
					"instance %q reports usage of %q, which seedUsageMetrics never reads", inst.Slug, slug)
				ent, ok := entitlementBySlug(slug)
				require.Truef(t, ok, "instance %q reports usage of unknown entitlement %q", inst.Slug, slug)
				require.Truef(t, entitlementschema.IsNumberFamily(ent.Type),
					"instance %q reports usage of %q, a %s entitlement, which takes none", inst.Slug, slug, ent.Type)

				start, err := usagePeriodStart(ent, now, now)
				require.NoError(t, err)
				require.Equalf(t, ent.ResetPeriod != nil, start.Valid,
					"instance %q: the %q usage row is periodic (%t) and the entitlement resets (%t)",
					inst.Slug, slug, start.Valid, ent.ResetPeriod != nil)
				if !start.Valid {
					continue
				}
				periodic++

				// And the read path takes the row for the current window's
				// usage rather than a past one's.
				window, err := period.Current(now, *ent.ResetPeriod, *ent.ResetAnchor, now)
				require.NoError(t, err)
				stored := &entitlementvalue.NumberUsageValue{
					Type:       entitlementvalue.TypeNumber,
					Value:      float64(usage.Value),
					EventCount: usage.EventCount,
				}
				require.Samef(t, stored, entitlementvalue.ResolveCurrentWindowUsage(stored, &start.Time, window),
					"instance %q: its %q usage row is dated %s, outside the current window", inst.Slug, slug, start.Time)
			}
		}
	}
	require.NotZero(t, periodic, "no usage row is periodic any more; this test guards nothing")
}

// TestSakuraTokyoInstancesResolveDifferentLicenses guards the dataset's
// central point: license attaches to the instance, not the customer. Sakura
// Tokyo's two instances must keep resolving two different licenses.
func TestSakuraTokyoInstancesResolveDifferentLicenses(t *testing.T) {
	var sakura customerDef
	found := false
	for _, cust := range customers {
		if cust.Slug == "sakura-tokyo" {
			sakura = cust
			found = true
		}
	}
	require.True(t, found, "sakura-tokyo customer not found")
	require.Lenf(t, sakura.Instances, 2, "expected sakura-tokyo to have two instances")

	licenseNames := make(map[string]struct{}, len(sakura.Instances))
	for _, inst := range sakura.Instances {
		require.NotEmpty(t, inst.LicenseName)
		licenseNames[inst.LicenseName] = struct{}{}
	}
	require.Lenf(t, licenseNames, 2, "sakura-tokyo's two instances must resolve two different licenses, got %v", licenseNames)
}

// TestAuditTrailReferencesKnownInstances guards against a slug typo or a
// renamed instance silently dropping an audit row (seedAuditTrail returns an
// error instead, but this test catches it without a database).
func TestAuditTrailReferencesKnownInstances(t *testing.T) {
	knownSlugs := make(map[string]struct{})
	for _, cust := range customers {
		for _, inst := range cust.Instances {
			knownSlugs[inst.Slug] = struct{}{}
		}
	}

	require.Len(t, auditTrail, 15, "expected 15 audit trail events, matching the source dataset")

	for _, ev := range auditTrail {
		require.NotEmptyf(t, ev.Name, "audit event %q missing a Name", ev.Type)
		require.NotEmptyf(t, ev.Type, "audit event %q missing a Type", ev.Name)
		if ev.InstanceSlug == "" {
			continue
		}
		_, ok := knownSlugs[ev.InstanceSlug]
		require.Truef(t, ok, "audit event %q references unknown instance slug %q", ev.Name, ev.InstanceSlug)
	}
}

// TestDeploymentsReferenceKnownZonesAndReleases guards the deployment
// journal against a zone/release slug typo before it ever reaches the
// database (seedDeploymentJournal would otherwise be the first thing to
// notice).
func TestDeploymentsReferenceKnownZonesAndReleases(t *testing.T) {
	knownZones := make(map[string]struct{}, len(deploymentZones))
	for _, dz := range deploymentZones {
		knownZones[dz.Key] = struct{}{}
	}
	knownReleases := make(map[string]struct{}, len(releases))
	for _, rel := range releases {
		knownReleases[rel.Version] = struct{}{}
	}

	for _, d := range deployments {
		_, ok := knownZones[d.ZoneKey]
		require.Truef(t, ok, "deployment references unknown zone %q", d.ZoneKey)
		_, ok = knownReleases[d.ReleaseVersion]
		require.Truef(t, ok, "deployment references unknown release %q", d.ReleaseVersion)
	}
}

// TestReleasesShipOneVersionOfEachComponent guards what each release bundles.
// A release inherits its previous release's components, so one that brings in
// a component's next version has to take out the version it inherited, or it
// ships both: 2026.8.0 once bundled two APIs, two web apps and two delivery
// services, seven components where it has four. The next version also follows
// the one it replaces, so the catalogue shows the chain.
func TestReleasesShipOneVersionOfEachComponent(t *testing.T) {
	bundles, err := releaseBundles()
	require.NoError(t, err)

	// Every component, by slug, in the order the patches create them. A new
	// version may only follow a component created before it, and one of the
	// same name: the next version of something else is not a version.
	components := make(map[string]componentPatch)
	for _, rel := range releases {
		for _, patch := range rel.Patches {
			if patch.Op != opAdd {
				continue
			}
			if patch.PreviousSlug != nil {
				previous, ok := components[*patch.PreviousSlug]
				require.Truef(t, ok, "component %q follows %q, which no earlier patch creates", *patch.Slug, *patch.PreviousSlug)
				require.Equalf(t, *previous.Name, *patch.Name, "component %q follows %q, another component", *patch.Slug, *patch.PreviousSlug)
			}
			components[*patch.Slug] = patch
		}
	}
	nameOf := func(slug string) string { return *components[slug].Name }

	upgrades := 0
	for _, rel := range releases {
		shipped := make(map[string]string, len(bundles[rel.Version])) // component name → slug
		for _, slug := range bundles[rel.Version] {
			other, twice := shipped[nameOf(slug)]
			require.Falsef(t, twice, "release %q ships two versions of %q: %q and %q", rel.Version, nameOf(slug), other, slug)
			shipped[nameOf(slug)] = slug
		}

		// A component the release ships in another version than its previous
		// release did is the successor of the version it replaces.
		if rel.PreviousVersion == "" {
			continue
		}
		for _, inherited := range bundles[rel.PreviousVersion] {
			replacement, kept := shipped[nameOf(inherited)]
			if !kept || replacement == inherited {
				continue
			}
			upgrades++
			require.Equalf(t, ptr.To(inherited), components[replacement].PreviousSlug,
				"release %q replaces %q with %q, which does not follow it", rel.Version, inherited, replacement)
		}
	}
	require.NotZero(t, upgrades, "no release upgrades a component any more; this test guards nothing")
}

// TestDeploymentZoneTypesAreEnvironments keeps a zone's type to the environment
// classes the console labels. `shared` and `dedicated` once sat there; they are
// not environments, and a dedicated zone now says so in its metadata.
func TestDeploymentZoneTypesAreEnvironments(t *testing.T) {
	for _, dz := range deploymentZones {
		require.Containsf(t, []string{"production", "staging", "development"}, dz.Type, "zone %q", dz.Key)
	}
}

// TestAuditTrailRefsNameSeededObjects catches a typo in a seedRef before the
// seed does: seedAuditTrail would fail on it, but only against a database.
func TestAuditTrailRefsNameSeededObjects(t *testing.T) {
	known := map[seedRefKind]map[string]struct{}{
		refInstanceID:    {},
		refZoneID:        {},
		refReleaseID:     {},
		refLicenseID:     {},
		refLicenseSlug:   {},
		refEntitlementID: {},
	}
	for _, cust := range customers {
		for _, inst := range cust.Instances {
			known[refInstanceID][inst.Slug] = struct{}{}
		}
	}
	for _, dz := range deploymentZones {
		known[refZoneID][dz.Key] = struct{}{}
	}
	for _, rel := range releases {
		known[refReleaseID][rel.Version] = struct{}{}
	}
	for _, lic := range licenses {
		known[refLicenseID][lic.Name] = struct{}{}
		known[refLicenseSlug][lic.Name] = struct{}{}
	}
	for _, ent := range entitlements {
		known[refEntitlementID][ent.Slug] = struct{}{}
	}

	refs := 0
	for _, ev := range auditTrail {
		for key, value := range ev.Payload {
			ref, ok := value.(seedRef)
			if !ok {
				continue
			}
			refs++
			_, found := known[ref.kind][ref.key]
			require.Truef(t, found, "audit event %q: payload key %q names %q, which nothing in data.go defines",
				ev.Name, key, ref.key)
		}
	}
	require.NotZero(t, refs, "no audit payload uses a seedRef any more; this test guards nothing")
}

// TestLicenseFamiliesAreServable guards the dataset against the two ways it
// could describe a license catalogue the database will refuse or the seeder
// cannot use.
//
// Both are runtime failures otherwise, and late ones: the check constraint
// fires on the INSERT, and the missing-published-version case only surfaces
// when seedCustomersAndInstances asks which license to pin an instance to. This
// catches them without a database, which is what the rest of this file is for.
func TestLicenseFamiliesAreServable(t *testing.T) {
	for _, lic := range licenses {
		t.Run(lic.Name, func(t *testing.T) {
			require.NotEmptyf(t, lic.Versions, "license %q has no versions", lic.Name)

			defaults := 0
			published := 0
			for vi, version := range lic.Versions {
				require.NotEmptyf(t, version.Description,
					"license %q v%d has no description", lic.Name, vi+1)
				require.Containsf(t,
					[]licenseschema.LifecycleState{licenseschema.Draft, licenseschema.Published, licenseschema.Archived},
					version.LifecycleState,
					"license %q v%d has an unknown lifecycle state %q", lic.Name, vi+1, version.LifecycleState)

				if version.LifecycleState == licenseschema.Published {
					published++
				}
				if version.IsDefault {
					defaults++
					// license_default_must_be_published_check.
					require.Equalf(t, licenseschema.Published, version.LifecycleState,
						"license %q v%d is the family default while %s; only a published version may be",
						lic.Name, vi+1, version.LifecycleState)
				}
			}

			// license_family_id_is_default_key.
			require.LessOrEqualf(t, defaults, 1,
				"license %q has %d default versions; a family may have at most one", lic.Name, defaults)
			require.Positivef(t, published,
				"license %q has no published version, so no instance could be pinned to it", lic.Name)
		})
	}
}

// TestInstancesUseKnownLicenses pairs with the above: an instance names a
// license family by name, and possibly one of its versions, which
// seedCustomersAndInstances looks up in what seedLicenses returns. A typo there
// is a seed-time error, and a silent one to read.
func TestInstancesUseKnownLicenses(t *testing.T) {
	knownLicenses := make(map[string]licenseDef, len(licenses))
	for _, lic := range licenses {
		knownLicenses[lic.Name] = lic
	}

	for _, cust := range customers {
		for _, inst := range cust.Instances {
			require.Containsf(t, knownLicenses, inst.LicenseName,
				"instance %q %s references unknown license %q", cust.Name, inst.NameSuffix, inst.LicenseName)
			versions := len(knownLicenses[inst.LicenseName].Versions)
			require.Truef(t, inst.LicenseVersion >= 0 && inst.LicenseVersion <= versions,
				"instance %q %s names v%d of %q, which has %d versions",
				cust.Name, inst.NameSuffix, inst.LicenseVersion, inst.LicenseName, versions)
		}
	}
}

// TestSomeInstancesStayOnOlderVersions keeps in the dataset the instances a
// catalogue with history actually has (S3): one on a version withdrawn from
// sale after it was bought, and one on a published version its
// family does not serve. Without them every instance sits on the version its
// family resolves to, and the console never shows either case.
func TestSomeInstancesStayOnOlderVersions(t *testing.T) {
	onArchived, offDefault := false, false
	for _, lic := range licenses {
		for _, cust := range customers {
			for _, inst := range cust.Instances {
				if inst.LicenseName != lic.Name || inst.LicenseVersion == 0 {
					continue
				}
				version := lic.Versions[inst.LicenseVersion-1]
				switch {
				case version.LifecycleState == licenseschema.Archived:
					onArchived = true
				case version.LifecycleState == licenseschema.Published && !version.IsDefault && hasDefault(lic):
					offDefault = true
				}
			}
		}
	}

	require.True(t, onArchived, "no instance stays on an archived version")
	require.True(t, offDefault, "no instance runs a published version its family does not put forward")
}

// TestWithdrawnVersionsDoNotDecideTheirFamily guards the order seedLicenses
// relies on. A version an instance is pinned to is archived only after the
// instances exist, so it is still on sale when the family is resolved. That
// resolution must not land on it -- the family's default, or a newer published
// version, has to outrank it -- or the family's other instances would be pinned
// to a version that is withdrawn a moment later.
func TestWithdrawnVersionsDoNotDecideTheirFamily(t *testing.T) {
	for _, lic := range licenses {
		for vi, version := range lic.Versions {
			if version.LifecycleState != licenseschema.Archived || !pinnedToVersion(lic.Name, vi) {
				continue
			}
			newerPublished := false
			for _, later := range lic.Versions[vi+1:] {
				if later.LifecycleState == licenseschema.Published {
					newerPublished = true
				}
			}
			require.Truef(t, hasDefault(lic) || newerPublished,
				"license %q v%d is archived after its instances exist, and nothing outranks it meanwhile", lic.Name, vi+1)
		}
	}
}

func hasDefault(lic licenseDef) bool {
	for _, version := range lic.Versions {
		if version.IsDefault {
			return true
		}
	}
	return false
}

var (
	familySlugEquals = regexp.MustCompile(`__kaiten\.license\.familySlug\s*==\s*'([^']*)'`)
	familySlugIn     = regexp.MustCompile(`__kaiten\.license\.familySlug\s+in\s+\[([^\]]*)\]`)
)

// TestFlagRulesTargetProductsByFamily keeps the demo's license rules on the
// fact that survives a new version (F1). __kaiten.license.slug names one
// version, so a rule reading it for a product stops matching once the product
// is revised: these rules matched nothing while the facts had no family.
// Every rule also lints against this dataset's entitlements, and names only
// families the catalogue has.
func TestFlagRulesTargetProductsByFamily(t *testing.T) {
	entitlementSlugs := make([]string, 0, len(entitlements))
	for _, ent := range entitlements {
		entitlementSlugs = append(entitlementSlugs, ent.Slug)
	}
	families := make(map[string]struct{}, len(licenses))
	for _, lic := range licenses {
		families[lic.Slug] = struct{}{}
	}

	named := 0
	for _, flag := range featureFlags {
		for _, targeting := range flag.Targetings {
			rule := targeting.GetRule().Value
			require.NoErrorf(t, featureflag.LintTargetingRule(rule, entitlementSlugs), "flag %q: %s", flag.Slug, rule)
			require.NotContainsf(t, rule, "__kaiten.license.slug",
				"flag %q targets one license version; target the product with __kaiten.license.familySlug", flag.Slug)

			var slugs []string
			for _, match := range familySlugEquals.FindAllStringSubmatch(rule, -1) {
				slugs = append(slugs, match[1])
			}
			for _, match := range familySlugIn.FindAllStringSubmatch(rule, -1) {
				for _, item := range strings.Split(match[1], ",") {
					slugs = append(slugs, strings.Trim(strings.TrimSpace(item), "'"))
				}
			}
			for _, slug := range slugs {
				require.Containsf(t, families, slug, "flag %q names %q, which is no license family of the dataset", flag.Slug, slug)
				named++
			}
		}
	}
	require.Positive(t, named, "no demo rule targets a license family")
}

// TestLicenseSlugsAreFixedAndDistinct pins the catalogue's addresses: the same
// on every seed, and one per version. Each family slug has to be a valid slug,
// and no version's slug -- the family's own for the first, {slug}-v{n} after
// -- may be another's: a family slugged "premium-v2" would take the address of
// Premium's second version and fail the seed.
func TestLicenseSlugsAreFixedAndDistinct(t *testing.T) {
	owners := make(map[string]string)
	for _, lic := range licenses {
		_, err := slugutil.New(lic.Slug)
		require.NoErrorf(t, err, "license %q has an invalid slug %q", lic.Name, lic.Slug)

		for vi := range lic.Versions {
			slug := lic.Slug
			if vi > 0 {
				slug = fmt.Sprintf("%s-v%d", lic.Slug, vi+1)
			}
			owner, taken := owners[slug]
			require.Falsef(t, taken, "slug %q belongs to both %q and %q", slug, owner, lic.Name)
			owners[slug] = lic.Name
		}
	}
}

// TestSomeFamilyPutsAnOlderVersionForward keeps in the catalogue the case the
// default exists for: a family whose default is a published version older
// than its highest published one. Without it every family resolves to the same
// version with or without its default, and the demo cannot show that the
// default wins.
func TestSomeFamilyPutsAnOlderVersionForward(t *testing.T) {
	for _, lic := range licenses {
		highestPublished, defaultIdx := -1, -1
		for vi, version := range lic.Versions {
			if version.LifecycleState == licenseschema.Published {
				highestPublished = vi
			}
			if version.IsDefault {
				defaultIdx = vi
			}
		}
		if defaultIdx >= 0 && defaultIdx < highestPublished {
			return
		}
	}
	t.Fatal("no license family has its default on a published version older than its highest published one")
}

// TestVersionGrantsOnlyOverrideWhatTheFamilyGrants keeps a version's grants a
// variation on its family's rather than a catalogue of their own: every
// license has grants, on known entitlements, and a version may only change the
// value of an entitlement its family already grants.
func TestVersionGrantsOnlyOverrideWhatTheFamilyGrants(t *testing.T) {
	known := make(map[string]struct{}, len(entitlements))
	for _, ent := range entitlements {
		known[ent.Slug] = struct{}{}
	}

	require.Len(t, licenseEntitlementValues, len(licenses), "every license, and only those, has grants")
	for _, lic := range licenses {
		base, ok := licenseEntitlementValues[lic.Name]
		require.Truef(t, ok, "license %q has no grants", lic.Name)
		for slug := range base {
			require.Containsf(t, known, slug, "license %q grants unknown entitlement %q", lic.Name, slug)
		}
		for vi, version := range lic.Versions {
			for slug := range version.Grants {
				require.Containsf(t, base, slug,
					"license %q v%d overrides %q, which its family does not grant", lic.Name, vi+1, slug)
			}
		}
	}
}

// TestRevisedFamiliesChangeWhatTheyGrant keeps a version history from being a
// change of description alone: a family with several versions has at least one
// that grants something the first does not, which is what comparing two
// versions in the console has to show.
func TestRevisedFamiliesChangeWhatTheyGrant(t *testing.T) {
	for _, lic := range licenses {
		if len(lic.Versions) < 2 {
			continue
		}
		first := versionGrants(lic, 0)
		changed := false
		for vi := 1; vi < len(lic.Versions); vi++ {
			if !reflect.DeepEqual(first, versionGrants(lic, vi)) {
				changed = true
			}
		}
		require.Truef(t, changed, "every version of license %q grants the same thing", lic.Name)
	}
}
