package stresstest

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
)

func TestSelectZoneKeyForInstance(t *testing.T) {
	productionProfile := mustInstanceProfileByName(t, "Production")
	stagingProfile := mustInstanceProfileByName(t, "Staging")
	sandboxProfile := mustInstanceProfileByName(t, "Sandbox")
	developmentProfile := mustInstanceProfileByName(t, "Development")

	tests := []struct {
		name          string
		customerIndex int
		profile       instanceProfile
		wantZoneKey   string
	}{
		{
			name:          "production alternates to eu for even customers",
			customerIndex: 0,
			profile:       productionProfile,
			wantZoneKey:   zoneKeyProductionEU,
		},
		{
			name:          "production alternates to us for odd customers",
			customerIndex: 1,
			profile:       productionProfile,
			wantZoneKey:   zoneKeyProductionUS,
		},
		{
			name:          "staging alternates to eu for even customers",
			customerIndex: 2,
			profile:       stagingProfile,
			wantZoneKey:   zoneKeyStagingEU,
		},
		{
			name:          "staging alternates to us for odd customers",
			customerIndex: 3,
			profile:       stagingProfile,
			wantZoneKey:   zoneKeyStagingUS,
		},
		{
			name:          "sandbox always resolves to sandbox zone",
			customerIndex: 7,
			profile:       sandboxProfile,
			wantZoneKey:   zoneKeySandbox,
		},
		{
			name:          "development always resolves to development zone",
			customerIndex: 9,
			profile:       developmentProfile,
			wantZoneKey:   zoneKeyDevelopment,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.wantZoneKey, selectZoneKeyForInstance(tt.customerIndex, tt.profile))
		})
	}
}

func TestTargetOrganizationsUsesResolvedIDs(t *testing.T) {
	resolvedOwnerID := uuid.New()
	resolvedTMNTHQID := uuid.New()
	resolvedFootClanID := uuid.New()

	targets, err := targetOrganizations(map[string]uuid.UUID{
		dev.DogfoodingOrgExternalID: uuid.New(),
		dev.TMNTHQOrgExternalID:     resolvedTMNTHQID,
		dev.FootClanOrgExternalID:   resolvedFootClanID,
	}, map[string]uuid.UUID{
		dev.PrimaryUserExternalID: resolvedOwnerID,
	})

	require.NoError(t, err)
	require.Equal(t, []seeder.TargetOrganization{
		{ID: resolvedTMNTHQID, Name: "TMNT HQ", OwnerUserID: resolvedOwnerID},
		{ID: resolvedFootClanID, Name: "Foot Clan", OwnerUserID: resolvedOwnerID},
	}, targets)
}

func TestBuildInstanceMetadataUsesCustomerAndZoneContext(t *testing.T) {
	profile := mustInstanceProfileByName(t, "Production")
	zone := seededDeploymentZone{
		ID:         uuid.New(),
		Definition: mustDeploymentZoneByKey(t, zoneKeyProductionEU),
	}
	customer := seededCustomer{
		Name:  "Acme Retail",
		Index: 7,
	}

	metadata := buildInstanceMetadata(customer, profile, zone, "Enterprise")

	assert.Equal(t, "stress-test", metadata["seed_profile"])
	assert.Equal(t, "production", metadata["environment"])
	assert.Equal(t, "enterprise", metadata["service_tier"])
	assert.Equal(t, "production", metadata["workload"])
	assert.Equal(t, map[string]interface{}{
		"name":  "Acme Retail",
		"index": 7,
	}, metadata["customer"])
	assert.Equal(t, map[string]interface{}{
		"zone_key":        zoneKeyProductionEU,
		"region":          zone.Definition.Region,
		"cluster":         zone.Definition.Cluster,
		"feature_toggles": zone.Definition.FeatureToggles,
	}, metadata["topology"])
	assert.Equal(t, []string{
		"production",
		"enterprise",
		zone.Definition.Region,
	}, metadata["labels"])
}

func TestFullProfileMetadataPayloadsSatisfyDeclaredSchemas(t *testing.T) {
	t.Parallel()

	deploymentZoneSchema := mustMetadataResourceSchema(t, seedkit.MetadataFieldsDeploymentZone, true)
	for _, zone := range deploymentZones {
		t.Run("deployment zone "+zone.Key, func(t *testing.T) {
			t.Parallel()
			assert.NoError(t, validator.ValidateMetadata(zone.MetadataPayload(), deploymentZoneSchema))
		})
	}

	instanceSchema := mustMetadataResourceSchema(t, seedkit.MetadataFieldsInstance, false)
	customer := seededCustomer{Name: "Acme Retail", Index: 7}
	for _, profile := range instanceProfiles {
		for _, zoneDef := range deploymentZones {
			for _, licenseName := range preferredLicenseRotation {
				t.Run(profile.NameSuffix+"/"+zoneDef.Key+"/"+licenseName, func(t *testing.T) {
					t.Parallel()
					metadata := buildInstanceMetadata(customer, profile, seededDeploymentZone{
						ID:         uuid.New(),
						Definition: zoneDef,
					}, licenseName)

					for _, field := range seedkit.MetadataFieldsInstance {
						assert.Contains(t, metadata, field.Key)
					}
					assert.NoError(t, validator.ValidateMetadata(metadata, instanceSchema))
				})
			}
		}
	}
}

func TestResolveReleaseIDForDeploymentZone(t *testing.T) {
	releaseIDsByVersion := make(map[string]uuid.UUID, len(deploymentZones))
	for _, zone := range deploymentZones {
		releaseIDsByVersion[zone.CurrentReleaseVersion] = uuid.New()
	}

	for _, zone := range deploymentZones {
		t.Run(zone.Name, func(t *testing.T) {
			releaseID, err := resolveReleaseIDForDeploymentZone(zone, releaseIDsByVersion)
			require.NoError(t, err)
			require.NotNil(t, releaseID)
			assert.Equal(t, releaseIDsByVersion[zone.CurrentReleaseVersion], *releaseID)
		})
	}

	_, err := resolveReleaseIDForDeploymentZone(
		DeploymentZoneDef{
			Name:                  "Broken zone",
			CurrentReleaseVersion: "v9.9.9",
		},
		releaseIDsByVersion,
	)
	require.ErrorContains(t, err, `unknown release version "v9.9.9"`)
}

func TestDeploymentZonesTopologyMatchesReleaseManagementSeed(t *testing.T) {
	require.Len(t, deploymentZones, 6)

	currentReleaseVersions := make([]string, 0, len(deploymentZones))
	zoneKeys := make([]string, 0, len(deploymentZones))

	for _, zone := range deploymentZones {
		zoneKeys = append(zoneKeys, zone.Key)
		currentReleaseVersions = append(currentReleaseVersions, zone.CurrentReleaseVersion)
	}

	assert.ElementsMatch(t, []string{
		zoneKeyProductionEU,
		zoneKeyProductionUS,
		zoneKeyStagingEU,
		zoneKeyStagingUS,
		zoneKeySandbox,
		zoneKeyDevelopment,
	}, zoneKeys)
	assert.ElementsMatch(t, []string{
		"v1.0.0",
		"v1.1.0",
		"v1.2.0",
		"v1.3.0",
		"v1.4.0",
		"v1.5.0",
	}, currentReleaseVersions)

	sandboxZone := mustDeploymentZoneByKey(t, zoneKeySandbox)
	developmentZone := mustDeploymentZoneByKey(t, zoneKeyDevelopment)
	assert.Equal(t, "development", sandboxZone.Type)
	assert.Equal(t, "Sandbox", sandboxZone.Name)
	assert.Equal(t, "Development", developmentZone.Name)

	for _, zone := range deploymentZones {
		assert.NotContains(t, zone.CurrentReleaseVersion, "v2.")
	}
}

func TestEntitlementGroupsCoverAllFullProfileEntitlements(t *testing.T) {
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

func mustDeploymentZoneByKey(t *testing.T, key string) DeploymentZoneDef {
	t.Helper()

	for _, zone := range deploymentZones {
		if zone.Key == key {
			return zone
		}
	}

	t.Fatalf("deployment zone %q not found", key)
	return DeploymentZoneDef{}
}

func mustInstanceProfileByName(t *testing.T, nameSuffix string) instanceProfile {
	t.Helper()

	for _, profile := range instanceProfiles {
		if profile.NameSuffix == nameSuffix {
			return profile
		}
	}

	t.Fatalf("instance profile %q not found", nameSuffix)
	return instanceProfile{}
}

func mustMetadataResourceSchema(t *testing.T, defs []seedkit.MetadataFieldDef, isStrict bool) []byte {
	t.Helper()

	fields := make([]metadatafieldsdb.MetadataField, 0, len(defs))
	for _, def := range defs {
		schemaBytes, err := json.Marshal(def.JSONSchema)
		require.NoError(t, err)
		fields = append(fields, metadatafieldsdb.MetadataField{
			Key:        def.Key,
			JsonSchema: schemaBytes,
		})
	}

	out, err := validator.BuildResourceSchema(fields, isStrict)
	require.NoError(t, err)
	return out
}

// TestLifecycleStateForVersion pins the catalogue shape the profile gives a
// family: with three versions or more, the oldest archived, the newest a
// draft and the ones between published; with fewer, everything published.
func TestLifecycleStateForVersion(t *testing.T) {
	const (
		archived  = licenseschema.Archived
		draft     = licenseschema.Draft
		published = licenseschema.Published
	)

	tests := []struct {
		versionCount int
		want         []licenseschema.LifecycleState
	}{
		{versionCount: 1, want: []licenseschema.LifecycleState{published}},
		{versionCount: 2, want: []licenseschema.LifecycleState{published, published}},
		{versionCount: 3, want: []licenseschema.LifecycleState{archived, published, draft}},
		{versionCount: 5, want: []licenseschema.LifecycleState{archived, published, published, published, draft}},
	}
	for _, test := range tests {
		got := make([]licenseschema.LifecycleState, 0, test.versionCount)
		for versionIdx := range test.versionCount {
			got = append(got, lifecycleStateForVersion(versionIdx, test.versionCount))
		}
		assert.Equalf(t, test.want, got, "states of a family with %d version(s)", test.versionCount)
	}
}

// TestDefaultVersionIndexIsTheNewestPublishedVersion checks the pair the seed
// relies on: the index defaultVersionIndex picks is a published version --
// license_default_must_be_published_check refuses anything else at insert
// time -- and no newer version is published, so the default is also what the
// family would serve without one.
func TestDefaultVersionIndexIsTheNewestPublishedVersion(t *testing.T) {
	for versionCount := 1; versionCount <= 8; versionCount++ {
		defaultIdx := defaultVersionIndex(versionCount)

		require.GreaterOrEqualf(t, defaultIdx, 0, "%d version(s)", versionCount)
		require.Lessf(t, defaultIdx, versionCount, "%d version(s)", versionCount)
		assert.Equalf(t, licenseschema.Published, lifecycleStateForVersion(defaultIdx, versionCount),
			"the default of a family with %d version(s) must be published", versionCount)
		for newer := defaultIdx + 1; newer < versionCount; newer++ {
			assert.NotEqualf(t, licenseschema.Published, lifecycleStateForVersion(newer, versionCount),
				"version %d of %d is published and newer than the default", newer+1, versionCount)
		}
	}
}

// TestLicenseFamiliesAreServable runs the same guard as the demo profile's
// test on the families this profile actually seeds: each has a published
// version for instances to be pinned to, and a family marked default gets it
// on a published version. Both would otherwise fail late, in the database or
// when seedLicenses resolves what instances use.
func TestLicenseFamiliesAreServable(t *testing.T) {
	profile := NewProfile()
	for _, lic := range licenses {
		t.Run(lic.Name, func(t *testing.T) {
			versionCount := profile.versionCountForLicense(lic.Name)
			require.Positive(t, versionCount)

			published := 0
			for versionIdx := range versionCount {
				if lifecycleStateForVersion(versionIdx, versionCount) == licenseschema.Published {
					published++
				}
			}
			require.Positivef(t, published,
				"license %q has no published version, so no instance could be pinned to it", lic.Name)

			if lic.IsDefault {
				assert.Equal(t, licenseschema.Published,
					lifecycleStateForVersion(defaultVersionIndex(versionCount), versionCount))
			}
		})
	}
}

// TestSomeInstancesStayOnTheirFamilysFirstVersion checks that the slots
// pinsFirstVersion picks, with the licenses the rotation gives them, cover both
// cases S3 is about: a family whose first version ends archived, and one whose
// first version stays on sale behind a newer one.
func TestSomeInstancesStayOnTheirFamilysFirstVersion(t *testing.T) {
	profile := NewProfile()
	seeded := make(map[string]uuid.UUID, len(licenses))
	for _, lic := range licenses {
		seeded[lic.Name] = uuid.New()
	}

	onArchived, onOlderPublished := 0, 0
	for customerIndex := range generatedCustomersPerOrg {
		for profileIndex := range instancesPerCustomer {
			if !pinsFirstVersion(customerIndex*instancesPerCustomer + profileIndex) {
				continue
			}
			licenseName := profile.resolveInstanceLicenseName(customerIndex, profileIndex, seeded)
			versionCount := profile.versionCountForLicense(licenseName)
			switch {
			case versionCount < 2:
			case lifecycleStateForVersion(0, versionCount) == licenseschema.Archived:
				onArchived++
			default:
				onOlderPublished++
			}
		}
	}

	assert.Positive(t, onArchived, "no instance stays on a first version that ends archived")
	assert.Positive(t, onOlderPublished, "no instance stays on a first version still on sale")
}

// TestInstanceLicenseIDPinsTheFirstVersionOnlyWhereItDiffers pins the choice
// for one slot: the family's first version for a pinned slot, the version the
// family resolves to otherwise, and the latter too when the first version is
// the one the family resolves to.
func TestInstanceLicenseIDPinsTheFirstVersionOnlyWhereItDiffers(t *testing.T) {
	first, current, only := uuid.New(), uuid.New(), uuid.New()
	catalogue := seededCatalogue{
		current:  map[string]uuid.UUID{"Pro": current, "Solo": only},
		versions: map[string][]uuid.UUID{"Pro": {first, current}, "Solo": {only}},
	}
	pinned := olderVersionInstanceEvery - 1

	id, err := catalogue.instanceLicenseID("Pro", pinned)
	require.NoError(t, err)
	assert.Equal(t, first, id)

	id, err = catalogue.instanceLicenseID("Pro", pinned+1)
	require.NoError(t, err)
	assert.Equal(t, current, id)

	id, err = catalogue.instanceLicenseID("Solo", pinned)
	require.NoError(t, err)
	assert.Equal(t, only, id)

	_, err = catalogue.instanceLicenseID("Unknown", pinned)
	assert.Error(t, err)
}
