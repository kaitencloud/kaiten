package demo

import (
	"fmt"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	addoncatalogue "github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
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

// TestEntitlementsArePresentedToCustomers keeps the demo catalogue renderable by
// customer-facing components, which show only user-facing entitlements, in
// display order, with their icon and unit labels: a catalogue without them
// renders as an empty pricing table. Each field passes the validation
// create-entitlement applies, and display orders are distinct, so the order is
// the dataset's rather than the database's.
func TestEntitlementsArePresentedToCustomers(t *testing.T) {
	owners := make(map[int32]string, len(entitlements))
	for _, ent := range entitlements {
		require.Truef(t, ent.UserFacing, "entitlement %q is hidden from customer-facing components", ent.Slug)
		require.NoErrorf(t, entitlementschema.ValidateIcon(ent.Icon), "entitlement %q icon", ent.Slug)
		require.NoErrorf(t, entitlementschema.ValidateUnitsConfiguration(ent.Type, ent.UnitSingular, ent.UnitPlural,
			ent.SaleUnitSingular, ent.SaleUnitPlural, ent.SaleUnitFactor),
			"entitlement %q units", ent.Slug)
		if ent.Type == entitlementschema.Number {
			require.NotNilf(t, ent.UnitSingular, "NUMBER entitlement %q has no unit labels", ent.Slug)
		}

		owner, taken := owners[ent.DisplayOrder]
		require.Falsef(t, taken, "display order %d belongs to both %q and %q", ent.DisplayOrder, owner, ent.Slug)
		owners[ent.DisplayOrder] = ent.Slug
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
			for slug := range inst.UsageValues {
				require.Containsf(t, usageEntitlementOrder, slug,
					"instance %q reports usage of %q, which seedUsageMetrics never reads", inst.Slug, slug)
				ent, ok := entitlementBySlug(slug)
				require.Truef(t, ok, "instance %q reports usage of unknown entitlement %q", inst.Slug, slug)
				require.Truef(t, entitlementschema.IsNumberFamily(ent.Type),
					"instance %q reports usage of %q, a %s entitlement, which takes none", inst.Slug, slug, ent.Type)

				if ent.ResetPeriod == nil {
					continue
				}
				periodic++

				// The seed writes the counter through
				// reportentitlementusagemetric.WriteSnapshot, which dates it in the
				// window that is current when it runs, so the read path takes it
				// for the current window's usage. That window has to resolve.
				_, err := period.Current(now, *ent.ResetPeriod, *ent.ResetAnchor, now)
				require.NoErrorf(t, err, "instance %q: no current window for its %q usage", inst.Slug, slug)
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
	known := make([]featureflag.KnownEntitlement, 0, len(entitlements))
	for _, ent := range entitlements {
		typ := featureflag.EntitlementConfig
		switch {
		case entitlementschema.IsNumberFamily(ent.Type):
			typ = featureflag.EntitlementNumber
		case ent.Type == entitlementschema.Boolean:
			typ = featureflag.EntitlementBoolean
		}
		known = append(known, featureflag.KnownEntitlement{Slug: ent.Slug, Type: typ})
	}
	families := make(map[string]struct{}, len(licenses))
	for _, lic := range licenses {
		families[lic.Slug] = struct{}{}
	}

	named := 0
	for _, flag := range featureFlags {
		for _, targeting := range flag.Targetings {
			rule := targeting.GetRule().Value
			require.NoErrorf(t, featureflag.LintTargetingRule(rule, known), "flag %q: %s", flag.Slug, rule)
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

// TestReleaseSlugsAreFixedAndDistinct pins the releases' addresses, as
// TestLicenseSlugsAreFixedAndDistinct pins the catalogue's: one valid slug per
// release, the same on every seed, so a link to a release keeps working after a
// reseed.
func TestReleaseSlugsAreFixedAndDistinct(t *testing.T) {
	owners := make(map[string]string, len(releases))
	for _, rel := range releases {
		_, err := slugutil.New(rel.Slug)
		require.NoErrorf(t, err, "release %q has an invalid slug %q", rel.Version, rel.Slug)

		owner, taken := owners[rel.Slug]
		require.Falsef(t, taken, "slug %q belongs to both %q and %q", rel.Slug, owner, rel.Version)
		owners[rel.Slug] = rel.Version
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

// The billing tests below pin the catalogue to the one brain's console captures
// show (screenshots/specs/screenshots.billing.ts), so the seeder, the captures
// and the docs tell one story: a change here that the captures do not make is
// a test to change on purpose.

// versionSlug is the slug of version vi of lic: the family's own for the
// first, {slug}-v{n} after.
func versionSlug(lic licenseDef, vi int) string {
	if vi == 0 {
		return lic.Slug
	}
	return fmt.Sprintf("%s-v%d", lic.Slug, vi+1)
}

// describePrice is a price as these tests compare it. A metered price bills
// per the sale unit of its entitlement, which the API reads back with it.
func describePrice(p prices.Draft) string {
	period := p.MeteredEntitlementSlug
	if p.BillingPeriod != nil {
		period = *p.BillingPeriod
	}
	described := fmt.Sprintf("%s: %s %s %s %s", *p.DisplayLabel, p.BillingModel, p.BillingTiming, period, p.UnitAmountDecimal)
	if ent, ok := entitlementBySlug(p.MeteredEntitlementSlug); ok && ent.SaleUnitSingular != nil {
		described += fmt.Sprintf(" per %s/%s x%g", *ent.SaleUnitSingular, *ent.SaleUnitPlural, *ent.SaleUnitFactor)
	}
	if p.IsDefault {
		described += " default"
	}
	return described
}

// TestLicensePricesFollowTheCaptures pins each version's prices, in euro cents.
// Each passes the checks CreateLicensePrice makes before reading anything, and
// a FREE version's are 0. An archived version takes no new price, so a priced
// version that ends archived must be one seedLicensePricing still finds on sale.
func TestLicensePricesFollowTheCaptures(t *testing.T) {
	standard := []string{
		"Standard, monthly: FLAT_FEE ADVANCE MONTHLY 4900 default",
		"Standard, yearly: FLAT_FEE ADVANCE ANNUAL 49000 default",
		"Orders above the allowance: OVERAGE ARREARS monthly-orders 50 per order/orders x1",
	}
	want := map[string][]string{
		"starter":     {"Starter: FLAT_FEE ADVANCE MONTHLY 0 default"},
		"standard":    standard,
		"standard-v2": standard,
		"premium": {
			"Premium, monthly: FLAT_FEE ADVANCE MONTHLY 24000 default",
			"Orders above the allowance: OVERAGE ARREARS monthly-orders 15 per order/orders x1",
		},
		"premium-v2": {
			"Premium, yearly: FLAT_FEE ADVANCE ANNUAL 290000 default",
			"Premium, monthly: FLAT_FEE ADVANCE MONTHLY 29000 default",
			"Orders above the allowance: OVERAGE ARREARS monthly-orders 15 per order/orders x1",
		},
		"premium-v3": nil,
	}

	got := make(map[string][]string)
	for _, lic := range licenses {
		for vi, version := range lic.Versions {
			slug := versionSlug(lic, vi)
			got[slug] = nil
			for _, price := range version.Prices {
				_, amount, err := price.Shape("CreateLicensePrice")
				require.NoErrorf(t, err, "%s: %s", slug, describePrice(price))
				require.NoErrorf(t, prices.RefuseAboveZeroOnFree("CreateLicensePrice", licensesdb.PricingType(lic.PricingType), amount),
					"%s: %s", slug, describePrice(price))
				got[slug] = append(got[slug], describePrice(price))
			}
			if len(version.Prices) > 0 && version.LifecycleState == licenseschema.Archived {
				require.Truef(t, pinnedToVersion(lic.Name, vi), "%s is priced, and archived before seedLicensePricing runs", slug)
			}
		}
	}
	require.Equal(t, want, got)
}

// TestLicenseFamiliesAreSoldAsInTheCaptures pins how each family is sold:
// Starter free and the fallback of the two others, Standard online, Premium on
// request through its sales page; all three in the public catalogue. A
// fallback must be another FREE family (UpdateLicenseFamily.InvalidFallback).
func TestLicenseFamiliesAreSoldAsInTheCaptures(t *testing.T) {
	pricingTypes := make(map[string]licenseschema.PricingType, len(licenses))
	got := make(map[string]string, len(licenses))
	for _, lic := range licenses {
		pricingTypes[lic.Slug] = lic.PricingType
		described := string(lic.PricingType)
		if lic.SelfServeCtaURL != nil {
			require.NoError(t, licenseschema.ValidateSelfServeCtaURL("CreateLicense", *lic.SelfServeCtaURL))
			described += " via " + *lic.SelfServeCtaURL
		}
		if lic.Public {
			described += ", public"
		}
		if lic.Fallback != nil {
			described += ", falls back to " + *lic.Fallback
		}
		got[lic.Slug] = described
	}
	require.Equal(t, map[string]string{
		"starter":  "FREE, public",
		"standard": "PAID, public, falls back to starter",
		"premium":  "CUSTOM via https://kaiten-sushi.example/contact-sales, public, falls back to starter",
	}, got)

	for _, lic := range licenses {
		if lic.Fallback != nil {
			require.NotEqual(t, lic.Slug, *lic.Fallback)
			require.Equalf(t, licenseschema.PricingTypeFree, pricingTypes[*lic.Fallback], "%s falls back to %q", lic.Slug, *lic.Fallback)
		}
	}
}

// TestAddonsFollowTheCaptures pins the two add-ons: their version, prices and
// grants, the license families they fit, and which one the public catalogue
// lists. What they name must be in the dataset.
func TestAddonsFollowTheCaptures(t *testing.T) {
	families := make([]string, 0, len(licenses))
	for _, lic := range licenses {
		families = append(families, lic.Slug)
	}

	got := make(map[string][]string, len(addons))
	for _, addon := range addons {
		slug := *addon.Addon.Slug
		_, err := slugutil.New(slug)
		require.NoError(t, err)
		require.NoError(t, addoncatalogue.ValidateMaxQuantity("CreateAddon", addon.Addon.MaxQuantity))

		described := []string{fmt.Sprintf("%s: %s, max %d, default %t",
			addon.Addon.Name, *addon.Addon.VersionName, *addon.Addon.MaxQuantity, addon.Addon.IsDefault)}
		for _, price := range addon.Prices {
			_, _, err := price.Shape("CreateAddonPrice")
			require.NoError(t, err)
			described = append(described, describePrice(price))
		}
		for _, grant := range addon.Grants {
			_, ok := entitlementBySlug(grant.EntitlementSlug)
			require.Truef(t, ok, "%s grants unknown entitlement %q", slug, grant.EntitlementSlug)
			described = append(described, fmt.Sprintf("%s %s %v", grant.OverrideBehavior, grant.EntitlementSlug, grant.Value["value"]))
		}
		for _, family := range addon.Compatible {
			require.Containsf(t, families, family, "%s fits unknown license family %q", slug, family)
		}
		described = append(described, "fits "+strings.Join(addon.Compatible, ", "))
		if addon.Public {
			described = append(described, "public")
		}
		got[slug] = described
	}
	require.Equal(t, map[string][]string{
		"extra-delivery-drivers": {
			"Extra delivery drivers: Packs of five, max 10, default true",
			"Extra delivery drivers, monthly: FLAT_FEE ADVANCE MONTHLY 1900 default",
			"Extra delivery drivers, yearly: FLAT_FEE ADVANCE ANNUAL 19000 default",
			"ADD delivery-drivers 5",
			"fits standard, premium",
			"public",
		},
		"priority-support": {
			"Priority support: Two-hour response, max 1, default true",
			"Priority support, monthly: FLAT_FEE ADVANCE MONTHLY 9900 default",
			"Priority support, yearly: FLAT_FEE ADVANCE ANNUAL 99000 default",
			"OVERRIDE support-tier map[channels:[email slack phone] response_sla_hours:2 tier:priority]",
			"fits premium",
		},
	}, got)
}

// TestVouchersFollowTheCaptures pins the five vouchers the seed publishes:
// type, code, duration, bounds, discount, grants and flag grants, and the
// license versions they apply to. What they name must be in the dataset: the
// versions, the entitlements a grant changes, and a flag with its variant.
func TestVouchersFollowTheCaptures(t *testing.T) {
	versions := make([]string, 0)
	for _, lic := range licenses {
		for vi := range lic.Versions {
			versions = append(versions, versionSlug(lic, vi))
		}
	}

	got := make([]string, 0, len(vouchers))
	for _, voucher := range vouchers {
		d := voucher.Draft
		parts := []string{*d.Code, d.VoucherType, d.Duration}
		if d.DurationInPeriods != nil {
			parts = append(parts, fmt.Sprintf("x%d", *d.DurationInPeriods))
		}
		if d.MaxRedemptions != nil {
			parts = append(parts, fmt.Sprintf("max %d", *d.MaxRedemptions))
		}
		if d.ExpiresAt != nil {
			parts = append(parts, "expires "+d.ExpiresAt.Format(time.RFC3339))
		}
		if d.PriceDiscountType != nil {
			parts = append(parts, *d.PriceDiscountValue, *d.PriceDiscountType)
			if d.Currency != nil {
				parts = append(parts, *d.Currency)
			}
			parts = append(parts, "on", *d.PriceAppliesTo)
		}
		for _, grant := range d.Grants {
			_, ok := entitlementBySlug(grant.EntitlementSlug)
			require.Truef(t, ok, "%s grants unknown entitlement %q", *d.Code, grant.EntitlementSlug)
			parts = append(parts, grant.ModifierType, *grant.ModifierValue, grant.EntitlementSlug)
		}
		for _, grant := range d.FlagGrants {
			i := slices.IndexFunc(featureFlags, func(flag schema.FeatureFlag) bool { return flag.Slug == grant.FlagSlug })
			require.GreaterOrEqualf(t, i, 0, "%s grants unknown flag %q", *d.Code, grant.FlagSlug)
			require.Truef(t, slices.ContainsFunc(featureFlags[i].Variants, func(v schema.Variant) bool { return v.Name == grant.Variant }),
				"%s grants %q, which flag %q does not have", *d.Code, grant.Variant, grant.FlagSlug)
			parts = append(parts, grant.FlagSlug+"="+grant.Variant)
		}
		for _, slug := range voucher.ApplicableLicenses {
			require.Containsf(t, versions, slug, "%s applies to unknown license %q", *d.Code, slug)
		}
		if len(voucher.ApplicableLicenses) > 0 {
			parts = append(parts, "for "+strings.Join(voucher.ApplicableLicenses, ","))
		}
		got = append(got, strings.Join(parts, " "))
	}
	require.Equal(t, []string{
		"WELCOME20 PRICE REPEATING x3 max 200 20 PERCENTAGE on LICENSE_BASE for standard,standard-v2",
		"PEAK-SEASON ENTITLEMENT_BOOST REPEATING x1 max 25 ADD 200 monthly-orders for premium,premium-v2",
		"TRACKING-PILOT FLAG_GRANT REPEATING x2 delivery-tracking-enabled=on for starter",
		"NEW-LOCATION COMPOSITE REPEATING x3 max 100 10 PERCENTAGE on LICENSE_BASE ADD 2 delivery-drivers for standard,standard-v2",
		"SUMMER-FESTIVAL PRICE ONE_TIME expires 2026-08-31T23:59:59Z 1000 FIXED_AMOUNT EUR on LICENSE_BASE",
	}, got)
}
