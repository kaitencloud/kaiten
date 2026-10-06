// Package stresstest implements the high-volume stress-test seed profile.
// It replicates the seed.sql logic using the application's use cases.
package stresstest

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

const (
	generatedCustomersPerOrg        = 24
	instancesPerCustomer            = 4
	generatedReleasesPerOrg         = 12
	generatedFeatureFlagsPerOrg     = 24
	serviceAccountsPerOrg           = 4
	tokensPerServiceAccount         = 3
	usageMetricsMetadataSeedVersion = "full-v3"
	customerTimelineMonthsBack      = 9
	customerTimelineStepDays        = 10

	// olderVersionInstanceEvery keeps one instance in that many on its
	// family's first version rather than the one the family serves (S3): an
	// archived version for a family with a history, an older published one
	// otherwise.
	olderVersionInstanceEvery = 8

	// Worker pool sizes — sized so that 4 parallel orgs stay within the
	// seeder's DB pool of 150 connections (4 × 35 = 140 peak per phase).
	organizationWorkers       = 4
	instanceWorkers           = 35
	licenseEntitlementWorkers = 35
	usageWorkers              = 35
)

var (
	instanceProfiles = []instanceProfile{
		{
			NameSuffix:       "Production",
			Description:      "Production workload",
			Environment:      "production",
			PrimaryZoneKey:   zoneKeyProductionEU,
			SecondaryZoneKey: zoneKeyProductionUS,
		},
		{
			NameSuffix:       "Staging",
			Description:      "Pre-production validation",
			Environment:      "staging",
			PrimaryZoneKey:   zoneKeyStagingEU,
			SecondaryZoneKey: zoneKeyStagingUS,
		},
		{
			NameSuffix:     "Sandbox",
			Description:    "Sandbox experimentation",
			Environment:    "sandbox",
			PrimaryZoneKey: zoneKeySandbox,
		},
		{
			NameSuffix:     "Development",
			Description:    "Development workspace",
			Environment:    "development",
			PrimaryZoneKey: zoneKeyDevelopment,
		},
	}

	tokenScopeSets = [][]string{
		{scope.ReadAll()},
		{
			scope.Read(scope.Instances),
			scope.Write(scope.Instances),
			scope.Read(scope.Entitlements),
			scope.Read(scope.DeploymentZones),
		},
		{
			scope.Read(scope.Customers),
			scope.Read(scope.Licenses),
			scope.Read(scope.FeatureFlags),
			scope.Read(scope.Releases),
			scope.Write(scope.Tokens),
		},
	}

	preferredLicenseRotation = []string{"Enterprise", "Pro", "Dev", "Starter", "Community"}

	licenseVersionsByName = map[string]int{
		"Community":  2,
		"Starter":    2,
		"Dev":        3,
		"Pro":        3,
		"Enterprise": 3,
	}
)

type seededCustomer struct {
	ID    uuid.UUID
	Name  string
	Index int
}

type instanceProfile struct {
	NameSuffix       string
	Description      string
	Environment      string
	PrimaryZoneKey   string
	SecondaryZoneKey string
}

type seededDeploymentZone struct {
	ID         uuid.UUID
	Definition DeploymentZoneDef
}

type seededInstance struct {
	ID          uuid.UUID
	Slug        string
	LicenseID   uuid.UUID
	LicenseName string
}

type usageAuditSeed struct {
	finalValue    int32
	acceptedCount int32
	events        []seededAuditEvent
}

type seededAuditEvent struct {
	eventCount    int32
	eventName     string
	eventType     string
	reportedValue *int32
	status        string
	timestamp     time.Time
	value         int32
}

var _ seeder.OrganizationScopedProfile = (*Profile)(nil)

// Profile is the full/high-volume seed profile.
type Profile struct{}

// NewProfile returns a new full Profile instance.
func NewProfile() *Profile { return &Profile{} }

func (p *Profile) Name() string {
	return "stress-test"
}

func (p *Profile) Description() string {
	return "[DEV/TESTING] High-volume seed across 4 orgs: entitlements, licenses, customers, 96 instances/org, usage metrics and audit trail, feature flags, service accounts. Use --clean for a fresh start."
}

func (p *Profile) Seed(ctx context.Context, sc *seeder.SeederContext) error {
	slog.Info("starting full profile seed")

	orgIDs, userIDs, err := p.seedOrganizationsAndUsers(ctx, sc)
	if err != nil {
		return err
	}

	targets, err := targetOrganizations(orgIDs, userIDs)
	if err != nil {
		return err
	}

	return p.SeedOrganizations(ctx, sc, targets)
}

func (p *Profile) SeedOrganizations(ctx context.Context, sc *seeder.SeederContext, organizations []seeder.TargetOrganization) error {
	if err := seedkit.ForEach(ctx, organizationWorkers, organizations, func(ctx context.Context, _ int, organization seeder.TargetOrganization) error {
		return p.seedOrg(ctx, sc, organization)
	}); err != nil {
		return err
	}

	slog.Info("✅ Full profile seed completed successfully!")
	return nil
}

func (p *Profile) seedOrg(ctx context.Context, sc *seeder.SeederContext, organization seeder.TargetOrganization) error {
	org := organization // local alias for readability

	slog.Info("📦 Seeding organization", "name", org.Name)

	orgCtx := sc.WithOrganization(org.ID, organization.OwnerUserID)

	// Phase 0: groups must exist before entitlements can reference them.
	if err := p.seedEntitlementGroups(ctx, orgCtx); err != nil {
		return err
	}

	// Phase 1: entitlements and licenses are independent.
	var entitlementIDs map[string]uuid.UUID
	var entitlementTypes map[string]entitlementschema.Type
	var catalogue seededCatalogue

	eg1, eg1Ctx := errgroup.WithContext(ctx)
	eg1.Go(func() error {
		var err error
		entitlementIDs, entitlementTypes, err = p.seedEntitlements(eg1Ctx, orgCtx)
		return err
	})
	eg1.Go(func() error {
		var err error
		catalogue, err = p.seedLicenses(eg1Ctx, orgCtx)
		return err
	})
	if err := eg1.Wait(); err != nil {
		return err
	}

	// Phase 2: associate entitlements to licenses (parallelized internally).
	thresholdsByLicense, err := p.seedLicenseEntitlements(ctx, orgCtx, entitlementTypes, catalogue.slugs)
	if err != nil {
		return err
	}

	// Phase 3: customers and releases are independent.
	var customers []seededCustomer
	var releaseIDsByVersion map[string]uuid.UUID

	eg3, eg3Ctx := errgroup.WithContext(ctx)
	eg3.Go(func() error {
		var err error
		customers, err = p.seedCustomers(eg3Ctx, orgCtx, org, org.ID)
		return err
	})
	eg3.Go(func() error {
		var err error
		releaseIDsByVersion, err = p.seedReleases(eg3Ctx, orgCtx)
		return err
	})
	if err := eg3.Wait(); err != nil {
		return err
	}

	// Phase 4: declare typed metadata fields, then create deployment zones and
	// instances whose metadata jsonb is conformant to the declared schema.
	if err := p.seedMetadataFields(ctx, orgCtx, org.ID, organization.OwnerUserID); err != nil {
		return err
	}

	zonesByKey, err := p.seedDeploymentZones(ctx, orgCtx, releaseIDsByVersion)
	if err != nil {
		return err
	}

	instances, err := p.seedInstances(ctx, orgCtx, customers, catalogue, zonesByKey)
	if err != nil {
		return err
	}

	// Now that the instances pinned to them exist, retire the versions that end
	// archived. An instance keeps a version that is archived; it just cannot be
	// given one.
	if err := seedkit.ArchiveLicenses(ctx, orgCtx, catalogue.withdrawnLater); err != nil {
		return err
	}

	// Phase 5: usage metrics, service accounts, and feature flags are all independent.
	eg5, eg5Ctx := errgroup.WithContext(ctx)
	eg5.Go(func() error {
		return p.seedUsageMetrics(eg5Ctx, orgCtx, org.ID, instances, entitlementIDs, thresholdsByLicense)
	})
	eg5.Go(func() error {
		return p.seedServiceAccountsAndTokens(eg5Ctx, orgCtx)
	})
	eg5.Go(func() error {
		return p.seedFeatureFlags(eg5Ctx, orgCtx)
	})
	return eg5.Wait()
}

func (p *Profile) seedOrganizationsAndUsers(ctx context.Context, sc *seeder.SeederContext) (map[string]uuid.UUID, map[string]uuid.UUID, error) {
	slog.Info("seeding organizations and users")

	return seedkit.SeedOrgsUsersMemberships(ctx, sc, dev.Orgs, dev.Users, seedkit.SeedOrgsOptions{
		StaffEmailDomain: dev.StaffEmailDomain,
		ExtraMemberships: dev.NonStaffMemberships,
	})
}

func targetOrganizations(orgIDs, userIDs map[string]uuid.UUID) ([]seeder.TargetOrganization, error) {
	ownerID := userIDs[dev.PrimaryUserExternalID]
	if ownerID == uuid.Nil {
		return nil, fmt.Errorf("full profile: primary user %q was not resolved", dev.PrimaryUserExternalID)
	}

	targets := make([]seeder.TargetOrganization, 0, len(dev.Orgs)-1)
	for _, org := range dev.Orgs {
		// The Kaiten control-plane / dogfooding org is not this profile's to fill
		// and must not receive high-volume fake product data.
		if org.ExternalID == dev.DogfoodingOrgExternalID {
			continue
		}
		// The demo sandbox org must start empty — its whole point is the
		// in-app "Seed demo data" empty→seeded flow.
		if org.ExternalID == dev.DemoSandboxOrgExternalID {
			continue
		}

		orgID := orgIDs[org.ExternalID]
		if orgID == uuid.Nil {
			return nil, fmt.Errorf("full profile: organization %q was not resolved", org.ExternalID)
		}
		targets = append(targets, seeder.TargetOrganization{
			ID:          orgID,
			Name:        org.Name,
			OwnerUserID: ownerID,
		})
	}
	return targets, nil
}

func (p *Profile) seedEntitlements(ctx context.Context, sc *seeder.SeederContext) (map[string]uuid.UUID, map[string]entitlementschema.Type, error) {
	res, err := seedkit.SeedEntitlements(ctx, sc, entitlements)
	if err != nil {
		return nil, nil, err
	}
	return res.IDs, res.Types, nil
}

func (p *Profile) seedEntitlementGroups(ctx context.Context, sc *seeder.SeederContext) error {
	return seedkit.SeedEntitlementGroups(ctx, sc, entitlementGroups)
}

// seededCatalogue is what seedLicenses leaves for the steps after it, keyed by
// license name.
type seededCatalogue struct {
	// current is the version each family resolves to.
	current map[string]uuid.UUID
	// versions and slugs describe every version, oldest first.
	versions map[string][]uuid.UUID
	slugs    map[string][]string
	// withdrawnLater are the versions that end archived. They stay on sale
	// until seedInstances has pinned instances to some of them, since no
	// instance can be given an archived version.
	withdrawnLater []string
}

// instanceLicenseID is the version the instance in slot is pinned to: the one
// its family resolves to, or -- for one instance in olderVersionInstanceEvery
// -- the family's first version, when that is a different one.
func (c seededCatalogue) instanceLicenseID(licenseName string, slot int) (uuid.UUID, error) {
	current, ok := c.current[licenseName]
	if !ok {
		return uuid.Nil, fmt.Errorf("unable to resolve license ID for %q", licenseName)
	}

	versions := c.versions[licenseName]
	if pinsFirstVersion(slot) && len(versions) > 0 && versions[0] != current {
		return versions[0], nil
	}
	return current, nil
}

// pinsFirstVersion reports whether the instance in slot stays on its family's
// first version.
func pinsFirstVersion(slot int) bool {
	return slot%olderVersionInstanceEvery == olderVersionInstanceEvery-1
}

func (p *Profile) seedLicenses(ctx context.Context, sc *seeder.SeederContext) (seededCatalogue, error) {
	catalogue := seededCatalogue{
		current:  make(map[string]uuid.UUID),
		versions: make(map[string][]uuid.UUID),
		slugs:    make(map[string][]string),
	}
	for _, lic := range licenses {
		versionCount := p.versionCountForLicense(lic.Name)
		defaultIdx := defaultVersionIndex(versionCount)
		// The family the first version opens, named after that version's slug.
		// Every later version has to point at it explicitly: since the license-family split a
		// shared name no longer makes two rows the same product, so repeating
		// the name would create one single-version family per revision.
		var familySlug *string
		var familyID uuid.UUID
		var heldBack []uuid.UUID
		for versionIdx := range versionCount {
			state := lifecycleStateForVersion(versionIdx, versionCount)
			// The version numbers still come out as 1..versionCount without
			// being asked for: each create takes the next one in the family.
			created, err := sc.Licenses.CreateLicense.Execute(ctx, &createlicense.Command{
				Name:           lic.Name,
				Description:    fmt.Sprintf("%s (revision %d)", lic.Description, versionIdx+1),
				Type:           lic.Type,
				VersionName:    ptr.To(fmt.Sprintf("%s v%d", lic.Name, versionIdx+1)),
				FamilySlug:     familySlug,
				IsDefault:      lic.IsDefault && versionIdx == defaultIdx,
				LifecycleState: seedkit.LicenseCreationState(state),
			})
			if err != nil {
				return seededCatalogue{}, err
			}
			if familySlug == nil {
				familySlug = ptr.To(created.Slug)
				familyID = created.FamilyID
			}

			catalogue.versions[lic.Name] = append(catalogue.versions[lic.Name], created.ID)
			catalogue.slugs[lic.Name] = append(catalogue.slugs[lic.Name], created.Slug)
			// Retired once the instances pinned to it exist (seedOrg), as in the
			// demo profile.
			if state == licenseschema.Archived {
				heldBack = append(heldBack, created.ID)
				catalogue.withdrawnLater = append(catalogue.withdrawnLater, created.Slug)
			}
		}

		// The version instances are pinned to and the one the catalogue serves
		// are the same row, and it is not necessarily the last one created -- a
		// family's newest version here can be a draft. Which row that is comes
		// from the query the family endpoints resolve with, not from defaultIdx:
		// that index says where this profile *put* the default, and for the
		// families where lic.IsDefault is false it never put one at all, leaving
		// it to predict a resolution it does not participate in. It happens to
		// predict it correctly today, which is exactly the kind of agreement that
		// stops holding without anything failing.
		served, err := licensesdb.New(sc.Pool()).GetCurrentLicenseVersionsByFamilyIDs(
			ctx, licensesdb.GetCurrentLicenseVersionsByFamilyIDsParams{
				OrganizationID: sc.OrganizationID,
				FamilyIds:      []uuid.UUID{familyID},
			})
		if err != nil {
			return seededCatalogue{}, fmt.Errorf("resolve current version of license %q: %w", lic.Name, err)
		}
		if len(served) == 0 {
			return seededCatalogue{}, fmt.Errorf("license %q has no published version for instances to use", lic.Name)
		}
		// The versions still to be archived are on sale during that resolution.
		// It must not land on one of them, or archiving it would take the
		// family's own version from under its instances.
		if slices.Contains(heldBack, served[0].ID) {
			return seededCatalogue{}, fmt.Errorf(
				"license %q resolves to v%d, which is archived once its instances exist", lic.Name, served[0].Version)
		}
		catalogue.current[lic.Name] = served[0].ID
	}
	return catalogue, nil
}

// lifecycleStateForVersion gives a long-lived family the shape a real catalogue
// has: its oldest version withdrawn, its newest still being prepared, and the
// ones in between on sale. Families with fewer than three versions are all
// published -- there is no history to have retired yet. This is the state a
// version ends in; seedLicenses reaches Archived through archive-license.
func lifecycleStateForVersion(versionIdx, versionCount int) licenseschema.LifecycleState {
	if versionCount < 3 {
		return licenseschema.Published
	}
	switch versionIdx {
	case 0:
		return licenseschema.Archived
	case versionCount - 1:
		return licenseschema.Draft
	default:
		return licenseschema.Published
	}
}

// defaultVersionIndex is the newest version lifecycleStateForVersion leaves
// published, which is the only kind a family's default may be
// (license_default_must_be_published_check).
func defaultVersionIndex(versionCount int) int {
	if versionCount < 3 {
		return versionCount - 1
	}
	return versionCount - 2
}

func (p *Profile) seedLicenseEntitlements(
	ctx context.Context,
	sc *seeder.SeederContext,
	entitlementTypes map[string]entitlementschema.Type,
	licenseSlugsByName map[string][]string,
) (map[string]map[string]int32, error) {
	type task struct {
		licSlug   string
		entSlug   string
		threshold int32
		entType   entitlementschema.Type
	}

	thresholdsByLicense := make(map[string]map[string]int32)
	tasks := make([]task, 0, len(licenseEntitlements)*3)

	for _, le := range licenseEntitlements {
		entSlug := le.EntitlementSlug
		licSlugs := licenseSlugsByName[le.LicenseName]
		entType, ok := entitlementTypes[le.EntitlementSlug]
		if !ok {
			return nil, fmt.Errorf("missing type for entitlement %q", le.EntitlementSlug)
		}
		if entSlug == "" || len(licSlugs) == 0 {
			return nil, fmt.Errorf("missing slug for entitlement %q or license %q", le.EntitlementSlug, le.LicenseName)
		}
		for _, licSlug := range licSlugs {
			tasks = append(tasks, task{
				licSlug:   licSlug,
				entSlug:   entSlug,
				threshold: le.Threshold,
				entType:   entType,
			})
		}
		if _, ok := thresholdsByLicense[le.LicenseName]; !ok {
			thresholdsByLicense[le.LicenseName] = make(map[string]int32)
		}
		thresholdsByLicense[le.LicenseName][le.EntitlementSlug] = le.Threshold
	}

	if err := seedkit.ForEach(ctx, licenseEntitlementWorkers, tasks, func(egCtx context.Context, _ int, t task) error {
		var value map[string]any
		switch t.entType {
		case entitlementschema.Boolean:
			value = map[string]any{"type": "boolean", "value": t.threshold > 0}
		case entitlementschema.Config:
			value = map[string]any{"type": "object", "value": map[string]any{}}
		default:
			value = map[string]any{"type": "number", "value": t.threshold}
		}

		return sc.Licenses.AssociateEntitlementWithLicense.Execute(egCtx, t.licSlug, &associateentitlementwithlicense.Command{
			EntitlementSlug: t.entSlug,
			Value:           value,
		})
	}); err != nil {
		return nil, err
	}

	return thresholdsByLicense, nil
}

func (p *Profile) seedCustomers(ctx context.Context, sc *seeder.SeederContext, org seeder.TargetOrganization, orgID uuid.UUID) ([]seededCustomer, error) {
	// Use a deterministic faker seeded from the org's UUID bytes so the same
	// org always gets the same set of generated company names.
	seed := uint64(org.ID[0])<<56 | uint64(org.ID[1])<<48 | uint64(org.ID[2])<<40 | uint64(org.ID[3])<<32 |
		uint64(org.ID[4])<<24 | uint64(org.ID[5])<<16 | uint64(org.ID[6])<<8 | uint64(org.ID[7])
	fake := gofakeit.New(seed)

	names := make([]string, 0, generatedCustomersPerOrg)
	for range generatedCustomersPerOrg {
		names = append(names, fake.Company())
	}

	type backdateRow struct {
		id        uuid.UUID
		createdAt time.Time
		updatedAt time.Time
	}

	customers := make([]seededCustomer, 0, len(names))
	backdates := make([]backdateRow, 0, len(names))
	timelineStart := time.Now().AddDate(0, -customerTimelineMonthsBack, 0)

	for i, name := range names {
		externalID := fmt.Sprintf("%s-customer-%03d", org.ID.String()[:8], i+1)
		created, err := sc.Customers.CreateCustomer.Execute(ctx, &createcustomer.Command{
			Name:               name,
			ExternalCustomerID: ptr.To(externalID),
		})
		if err != nil {
			return nil, err
		}

		createdAt := timelineStart.AddDate(0, 0, i*customerTimelineStepDays)
		updatedAt := createdAt.AddDate(0, 0, 2)
		if updatedAt.After(time.Now()) {
			updatedAt = createdAt
		}
		backdates = append(backdates, backdateRow{id: created.ID, createdAt: createdAt, updatedAt: updatedAt})

		customers = append(customers, seededCustomer{
			ID:    created.ID,
			Name:  created.Name,
			Index: i,
		})
	}

	// Bulk-backdate all customers in one query instead of one UPDATE per customer.
	if len(backdates) > 0 {
		ids := make([]uuid.UUID, len(backdates))
		createdAts := make([]time.Time, len(backdates))
		updatedAts := make([]time.Time, len(backdates))
		for i, b := range backdates {
			ids[i] = b.id
			createdAts[i] = b.createdAt
			updatedAts[i] = b.updatedAt
		}
		if err := sc.Exec(ctx, `
			UPDATE customer
			SET created_at = u.ca,
			    updated_at = u.ua
			FROM (
				SELECT UNNEST($1::uuid[])        AS id,
				       UNNEST($2::timestamptz[]) AS ca,
				       UNNEST($3::timestamptz[]) AS ua
			) u
			WHERE customer.id             = u.id
			  AND customer.organization_id = $4
		`, ids, createdAts, updatedAts, orgID); err != nil {
			return nil, err
		}
	}

	return customers, nil
}

func selectZoneKeyForInstance(customerIndex int, profile instanceProfile) string {
	if profile.SecondaryZoneKey != "" && customerIndex%2 == 1 {
		return profile.SecondaryZoneKey
	}

	return profile.PrimaryZoneKey
}

func resolveSeededDeploymentZone(
	customerIndex int,
	profile instanceProfile,
	zonesByKey map[string]seededDeploymentZone,
) (seededDeploymentZone, error) {
	zoneKey := selectZoneKeyForInstance(customerIndex, profile)
	zone, ok := zonesByKey[zoneKey]
	if !ok {
		return seededDeploymentZone{}, fmt.Errorf("missing deployment zone %q for instance profile %q", zoneKey, profile.NameSuffix)
	}

	return zone, nil
}

func buildInstanceMetadata(
	customer seededCustomer,
	profile instanceProfile,
	zone seededDeploymentZone,
	licenseName string,
) map[string]interface{} {
	serviceTier := strings.ToLower(licenseName)
	workload := strings.ToLower(profile.NameSuffix)

	return map[string]interface{}{
		"seed_profile": "stress-test",
		"customer": map[string]interface{}{
			"name":  customer.Name,
			"index": customer.Index,
		},
		"environment":  profile.Environment,
		"service_tier": serviceTier,
		"workload":     workload,
		"topology": map[string]interface{}{
			"zone_key":        zone.Definition.Key,
			"region":          zone.Definition.Region,
			"cluster":         zone.Definition.Cluster,
			"feature_toggles": append([]string{}, zone.Definition.FeatureToggles...),
		},
		"labels": uniqueStrings(
			profile.Environment,
			serviceTier,
			zone.Definition.Region,
			workload,
		),
	}
}

func uniqueStrings(values ...string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func resolveReleaseIDForDeploymentZone(
	zone DeploymentZoneDef,
	releaseIDsByVersion map[string]uuid.UUID,
) (*uuid.UUID, error) {
	if zone.CurrentReleaseVersion == "" {
		return nil, nil
	}

	releaseID, ok := releaseIDsByVersion[zone.CurrentReleaseVersion]
	if !ok {
		return nil, fmt.Errorf(
			"deployment zone %q references unknown release version %q",
			zone.Name,
			zone.CurrentReleaseVersion,
		)
	}

	return ptr.To(releaseID), nil
}

// seedInstanceStatuses spreads seeded instances across every operational
// status instead of leaving them all on the HEALTHY default, so the
// seed data exercises the status badge and filter. Indexed by instance slot.
var seedInstanceStatuses = []instanceschema.InstanceStatus{
	instanceschema.InstanceStatusHealthy,
	instanceschema.InstanceStatusHealthy,
	instanceschema.InstanceStatusDegraded,
	instanceschema.InstanceStatusIncident,
	instanceschema.InstanceStatusMaintenance,
}

// seedInstanceLifecycleStages spreads seeded instances across the default
// commercial lifecycle stages plus a free-form custom value and an
// unset case, so the seed reflects the full nullable / free-form range.
// Indexed by instance slot; a nil entry leaves lifecycle_stage NULL.
var seedInstanceLifecycleStages = []*string{
	ptr.To("TRIAL"),
	ptr.To("ACTIVE"),
	ptr.To("ACTIVE"),
	ptr.To("AT_RISK"),
	ptr.To("CHURNED"),
	ptr.To("PILOT"), // free-form custom value — renders as a neutral badge
	nil,             // unset — exercises the nullable case
}

func (p *Profile) seedInstances(
	ctx context.Context,
	sc *seeder.SeederContext,
	customers []seededCustomer,
	catalogue seededCatalogue,
	zonesByKey map[string]seededDeploymentZone,
) ([]seededInstance, error) {
	total := len(customers) * instancesPerCustomer
	instances := make([]seededInstance, total)

	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(instanceWorkers)
	now := time.Now()

	for ci, customer := range customers {
		for i := range instancesPerCustomer {
			slot := ci*instancesPerCustomer + i
			profile := instanceProfiles[i%len(instanceProfiles)]
			zone, err := resolveSeededDeploymentZone(customer.Index, profile, zonesByKey)
			if err != nil {
				return nil, err
			}
			licenseName := p.resolveInstanceLicenseName(customer.Index, i, catalogue.current)
			licenseID, err := catalogue.instanceLicenseID(licenseName, slot)
			if err != nil {
				return nil, err
			}
			startDate := now.AddDate(0, -1-(i%2), -(customer.Index % 25))
			endDate := startDate.AddDate(1, 0, 0)
			zoneID := zone.ID
			metadata := buildInstanceMetadata(customer, profile, zone, licenseName)

			eg.Go(func() error {
				created, err := sc.Instances.CreateInstance.Execute(egCtx, &createinstance.Command{
					Name:             fmt.Sprintf("%s %s", customer.Name, profile.NameSuffix),
					Description:      profile.Description,
					CustomerID:       customer.ID,
					LicenseID:        licenseID,
					DeploymentZoneID: &zoneID,
					StartLicenseDate: startDate,
					EndLicenseDate:   endDate,
					Metadata:         metadata,
				})
				if err != nil {
					return err
				}

				// CreateInstance has no status/lifecycle fields, so set the
				// seeded commercial signals directly as
				// initial state — a targeted Exec rather than PatchInstance, to
				// avoid fabricating a "changed" event history for seed data.
				status := seedInstanceStatuses[slot%len(seedInstanceStatuses)]
				lifecycleStage := seedInstanceLifecycleStages[slot%len(seedInstanceLifecycleStages)]
				if err := sc.Exec(
					egCtx,
					`UPDATE instance SET status = $1::instance_status, lifecycle_stage = $2 WHERE id = $3`,
					string(status), lifecycleStage, created.ID,
				); err != nil {
					return err
				}

				// Each goroutine writes to a unique slot — no mutex needed.
				instances[slot] = seededInstance{
					ID:          created.ID,
					Slug:        created.Slug,
					LicenseID:   licenseID,
					LicenseName: licenseName,
				}
				return nil
			})
		}
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	return instances, nil
}

// seedMetadataFields declares the org-scoped MetadataField rows for
// DEPLOYMENT_ZONE and INSTANCE. Once that lands the createmetadatafield
// module, this seeder can switch from raw InsertMetadataField to the
// use-case-level command (consistent with the rest of this profile).
func (p *Profile) seedMetadataFields(
	ctx context.Context,
	sc *seeder.SeederContext,
	orgID uuid.UUID,
	userID uuid.UUID,
) error {
	return seedkit.SeedMetadataFields(ctx, sc, orgID, userID, seedkit.MetadataFieldsDeploymentZone, seedkit.MetadataFieldsInstance)
}

func (p *Profile) seedDeploymentZones(
	ctx context.Context,
	sc *seeder.SeederContext,
	releaseIDsByVersion map[string]uuid.UUID,
) (map[string]seededDeploymentZone, error) {
	zonesByKey := make(map[string]seededDeploymentZone, len(deploymentZones))

	for _, dz := range deploymentZones {
		releaseID, err := resolveReleaseIDForDeploymentZone(dz, releaseIDsByVersion)
		if err != nil {
			return nil, err
		}

		created, err := sc.DeploymentZones.CreateDeploymentZone.Execute(ctx, &createdeploymentzone.Command{
			Name:        dz.Name,
			Type:        dz.Type,
			Description: dz.Description,
			Metadata:    dz.MetadataPayload(),
			ReleaseID:   releaseID,
		})
		if err != nil {
			return nil, err
		}

		zonesByKey[dz.Key] = seededDeploymentZone{
			ID:         created.ID,
			Definition: dz,
		}
	}

	return zonesByKey, nil
}

func (p *Profile) seedReleases(ctx context.Context, sc *seeder.SeederContext) (map[string]uuid.UUID, error) {
	releaseIDsByVersion := make(map[string]uuid.UUID, len(releases)+generatedReleasesPerOrg)
	releaseComponentIDsByVersion := make(map[string][]uuid.UUID, len(releases)+generatedReleasesPerOrg)
	componentIDsBySlug := make(map[string]uuid.UUID)

	for _, rel := range releases {
		componentIDs := make([]uuid.UUID, 0)
		if rel.PreviousVersion != "" {
			if _, ok := releaseIDsByVersion[rel.PreviousVersion]; !ok {
				return nil, fmt.Errorf("release %q references unknown previous version %q", rel.Version, rel.PreviousVersion)
			}

			previousComponentIDs, ok := releaseComponentIDsByVersion[rel.PreviousVersion]
			if !ok {
				return nil, fmt.Errorf("release %q is missing seeded components for previous version %q", rel.Version, rel.PreviousVersion)
			}
			componentIDs = append(componentIDs, previousComponentIDs...)
		}

		for _, patch := range rel.ComponentPatches {
			switch patch.Op {
			case releaseComponentPatchAdd:
				if patch.Name == nil || patch.Version == nil {
					return nil, fmt.Errorf("release %q contains an add patch without name/version", rel.Version)
				}

				componentCommand := &createcomponent.Command{
					Name:        *patch.Name,
					Version:     *patch.Version,
					Slug:        patch.Slug,
					Description: patch.Description,
				}

				component, err := sc.Components.CreateComponent.Execute(ctx, componentCommand)
				if err != nil {
					return nil, err
				}

				componentIDs = append(componentIDs, component.ID)
				componentIDsBySlug[component.Slug] = component.ID
			case releaseComponentPatchRemove:
				if patch.ComponentSlug == nil {
					return nil, fmt.Errorf("release %q contains a remove patch without component slug", rel.Version)
				}

				componentID, ok := componentIDsBySlug[*patch.ComponentSlug]
				if !ok {
					return nil, fmt.Errorf("release %q references unknown component slug %q", rel.Version, *patch.ComponentSlug)
				}

				filtered := make([]uuid.UUID, 0, len(componentIDs))
				for _, existingComponentID := range componentIDs {
					if existingComponentID != componentID {
						filtered = append(filtered, existingComponentID)
					}
				}
				componentIDs = filtered
			default:
				return nil, fmt.Errorf("release %q contains unsupported component patch op %q", rel.Version, patch.Op)
			}
		}

		created, err := sc.Releases.CreateRelease.Execute(ctx, &createrelease.Command{
			Version:      rel.Version,
			Description:  ptr.To(rel.Description),
			ComponentIDs: componentIDs,
		})
		if err != nil {
			return nil, err
		}

		releaseIDsByVersion[rel.Version] = created.ID
		releaseComponentIDsByVersion[rel.Version] = append([]uuid.UUID(nil), componentIDs...)
	}

	var previousGeneratedComponentIDs []uuid.UUID
	previousGeneratedSourceVersion := ""
	if len(releases) > 0 {
		lastSeededVersion := releases[len(releases)-1].Version
		previousGeneratedComponentIDs = append(previousGeneratedComponentIDs, releaseComponentIDsByVersion[lastSeededVersion]...)
		previousGeneratedSourceVersion = lastSeededVersion
	}

	for i := range generatedReleasesPerOrg {
		version := fmt.Sprintf("v2.%d.%d", i/6, i%6)
		description := fmt.Sprintf(
			"Generated stress-test release %d cloned from %s to simulate rollout traffic",
			i+1,
			previousGeneratedSourceVersion,
		)
		created, err := sc.Releases.CreateRelease.Execute(ctx, &createrelease.Command{
			Version:      version,
			Description:  ptr.To(description),
			ComponentIDs: previousGeneratedComponentIDs,
		})
		if err != nil {
			return nil, err
		}

		releaseIDsByVersion[version] = created.ID
		releaseComponentIDsByVersion[version] = append([]uuid.UUID(nil), previousGeneratedComponentIDs...)
		previousGeneratedComponentIDs = append([]uuid.UUID(nil), releaseComponentIDsByVersion[version]...)
		previousGeneratedSourceVersion = version
	}

	return releaseIDsByVersion, nil
}

func (p *Profile) seedFeatureFlags(ctx context.Context, sc *seeder.SeederContext) error {
	flags := append([]schema.FeatureFlag{}, featureFlags...)
	flags = append(flags, p.generatedFeatureFlags()...)
	return seedkit.SeedFeatureFlags(ctx, sc, flags, false)
}

func (p *Profile) seedUsageMetrics(
	ctx context.Context,
	sc *seeder.SeederContext,
	orgID uuid.UUID,
	instances []seededInstance,
	entitlementIDs map[string]uuid.UUID,
	thresholdsByLicense map[string]map[string]int32,
) error {
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(usageWorkers)
	now := time.Now().UTC()

	for idx, instance := range instances {
		eg.Go(func() error {
			thresholds, ok := thresholdsByLicense[instance.LicenseName]
			if !ok {
				return nil
			}

			for entIdx, ent := range entitlements {
				if ent.Type != entitlementschema.Number {
					continue
				}

				entitlementID, ok := entitlementIDs[ent.Slug]
				if !ok {
					continue
				}

				threshold, found := thresholds[ent.Slug]
				if !found {
					continue
				}

				seed := p.buildUsageAuditSeed(now, threshold, idx*len(entitlements)+entIdx)

				// The final counter, written with its usage_ledger row. The
				// seeded history below goes to the audit trail only: its
				// reports are dated days back, before the journal of a fresh
				// database begins.
				if err := reportentitlementusagemetric.WriteSnapshot(egCtx, uow.NewUnitOfWork(sc.Pool()), reportentitlementusagemetric.Snapshot{
					OrganizationID:  orgID,
					InstanceSlug:    instance.Slug,
					EntitlementSlug: ent.Slug,
					Value:           float64(seed.finalValue),
					EventCount:      seed.acceptedCount,
				}); err != nil {
					return err
				}

				for _, event := range seed.events {
					if err := p.insertSeededAuditTrailEvent(egCtx, sc, orgID, instance, entitlementID, ent, threshold, event); err != nil {
						return err
					}
				}
			}

			return nil
		})
	}

	return eg.Wait()
}

func (p *Profile) buildUsageAuditSeed(now time.Time, threshold int32, ordinal int) usageAuditSeed {
	finalValue := p.usageSeedValue(entitlementschema.Number, threshold, ordinal)
	acceptedValues := buildAcceptedUsageValues(finalValue)
	acceptedOffsets := acceptedDayOffsets(len(acceptedValues))
	hourOffset := time.Duration((ordinal%6)*2) * time.Hour

	events := make([]seededAuditEvent, 0, len(acceptedValues)+3)
	currentValue := int32(0)
	insertedRejection := false

	for stepIdx, acceptedValue := range acceptedValues {
		eventCount := int32(stepIdx + 1)
		reportedValue := acceptedValue - currentValue
		if reportedValue < 0 {
			reportedValue = 0
		}

		acceptedAt := now.AddDate(0, 0, -acceptedOffsets[stepIdx]).Add(hourOffset)
		events = append(events, seededAuditEvent{
			eventCount:    eventCount,
			eventName:     instanceevents.EntitlementUsageReportAccepted.Name,
			eventType:     instanceevents.EntitlementUsageReportAccepted.Type,
			reportedValue: ptr.To(reportedValue),
			status:        string(instanceevents.UsageReportStatusAccepted),
			timestamp:     acceptedAt,
			value:         acceptedValue,
		})
		currentValue = acceptedValue

		if stepIdx == 0 {
			events = append(events, seededAuditEvent{
				eventCount: eventCount,
				eventName:  instanceevents.EntitlementValueGet.Name,
				eventType:  instanceevents.EntitlementValueGet.Type,
				status:     string(instanceevents.UsageReportStatusAccepted),
				timestamp:  acceptedAt.Add(6 * time.Hour),
				value:      currentValue,
			})

			if len(acceptedValues) > 1 && shouldSeedRejectedUsage(threshold, currentValue, ordinal) {
				overflow := threshold - currentValue + int32(1+(ordinal%4))
				if overflow < 1 {
					overflow = 1
				}

				events = append(events, seededAuditEvent{
					eventCount:    eventCount,
					eventName:     instanceevents.EntitlementUsageReportRejected.Name,
					eventType:     instanceevents.EntitlementUsageReportRejected.Type,
					reportedValue: ptr.To(overflow),
					status:        string(instanceevents.UsageReportStatusRejected),
					timestamp:     acceptedAt.AddDate(0, 0, 2).Add(3 * time.Hour),
					value:         currentValue,
				})
				insertedRejection = true
			}
		}

		if stepIdx == len(acceptedValues)-2 && !insertedRejection {
			events = append(events, seededAuditEvent{
				eventCount: eventCount,
				eventName:  instanceevents.EntitlementValueGet.Name,
				eventType:  instanceevents.EntitlementValueGet.Type,
				status:     string(instanceevents.UsageReportStatusAccepted),
				timestamp:  acceptedAt.AddDate(0, 0, 1).Add(2 * time.Hour),
				value:      currentValue,
			})
		}
	}

	finalReadAt := now.Add(-time.Duration((ordinal%8)+1) * time.Hour)
	if len(events) > 0 && finalReadAt.Before(events[len(events)-1].timestamp) {
		finalReadAt = events[len(events)-1].timestamp.Add(6 * time.Hour)
	}

	events = append(events, seededAuditEvent{
		//nolint:gosec // length of a slice this function built from a fixed seed plan
		eventCount: int32(len(acceptedValues)),
		eventName:  instanceevents.EntitlementValueGet.Name,
		eventType:  instanceevents.EntitlementValueGet.Type,
		status:     string(instanceevents.UsageReportStatusAccepted),
		timestamp:  finalReadAt,
		value:      currentValue,
	})

	return usageAuditSeed{
		finalValue: currentValue,
		//nolint:gosec // length of a slice this function built from a fixed seed plan
		acceptedCount: int32(len(acceptedValues)),
		events:        events,
	}
}

func (p *Profile) insertSeededAuditTrailEvent(
	ctx context.Context,
	sc *seeder.SeederContext,
	orgID uuid.UUID,
	instance seededInstance,
	entitlementID uuid.UUID,
	entitlement seedkit.EntitlementDef,
	threshold int32,
	event seededAuditEvent,
) error {
	payload := map[string]any{
		"entitlement_id":   entitlementID,
		"entitlement_slug": entitlement.Slug,
		"event_count":      event.eventCount,
		"instance_id":      instance.ID,
		"license_id":       instance.LicenseID,
		"organization_id":  orgID,
		"seed_version":     usageMetricsMetadataSeedVersion,
		"timestamp":        event.timestamp.UTC(),
		"type":             string(entitlement.Type),
		"value":            event.value,
	}
	if event.status != "" {
		payload["status"] = event.status
	}
	if event.reportedValue != nil {
		payload["behavior"] = "append"
		payload["reported_value"] = *event.reportedValue
	}
	if threshold >= 0 {
		payload["threshold"] = threshold
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return sc.Exec(ctx, `
		INSERT INTO audit_trail (
			instance_id,
			event_name,
			event_type,
			occurred_at,
			payload,
			organization_id
		)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6)
	`, instance.ID, event.eventName, event.eventType, event.timestamp.UTC(), string(payloadJSON), orgID)
}

func acceptedDayOffsets(stepCount int) []int {
	switch stepCount {
	case 1:
		return []int{3}
	case 2:
		return []int{10, 2}
	default:
		return []int{14, 7, 2}
	}
}

func buildAcceptedUsageValues(finalValue int32) []int32 {
	if finalValue <= 0 {
		return []int32{0}
	}
	if finalValue == 1 {
		return []int32{1}
	}
	if finalValue <= 5 {
		first := finalValue - 1
		if first < 1 {
			first = 1
		}
		if first == finalValue {
			return []int32{finalValue}
		}
		return []int32{first, finalValue}
	}

	first := finalValue / 3
	if first < 1 {
		first = 1
	}

	second := (finalValue * 2) / 3
	if second <= first {
		second = first + 1
	}
	if second >= finalValue {
		second = finalValue - 1
	}

	values := []int32{first}
	if second > first {
		values = append(values, second)
	}
	if finalValue > values[len(values)-1] {
		values = append(values, finalValue)
	}
	return values
}

func shouldSeedRejectedUsage(threshold, currentValue int32, ordinal int) bool {
	if threshold <= 0 || threshold == int32(entitlementvalue.UnlimitedThreshold) {
		return false
	}
	if currentValue >= threshold {
		return false
	}
	return ordinal%4 == 0
}

func (p *Profile) seedServiceAccountsAndTokens(ctx context.Context, sc *seeder.SeederContext) error {
	accounts := make([]seedkit.ServiceAccountDef, 0, serviceAccountsPerOrg)
	for i := range serviceAccountsPerOrg {
		accountName := fmt.Sprintf("automation-bot-%02d", i+1)
		tokens := make([]seedkit.TokenDef, 0, tokensPerServiceAccount)
		for tokenIdx := range tokensPerServiceAccount {
			tokenName := fmt.Sprintf("%s-token-%02d", accountName, tokenIdx+1)

			var expiresAt *time.Time
			if tokenIdx > 0 {
				expiry := time.Now().AddDate(0, tokenIdx*3, 0)
				expiresAt = &expiry
			}

			tokens = append(tokens, seedkit.TokenDef{
				Name:      tokenName,
				Scopes:    tokenScopeSets[(i+tokenIdx)%len(tokenScopeSets)],
				ExpiresAt: expiresAt,
			})
		}
		accounts = append(accounts, seedkit.ServiceAccountDef{Name: accountName, Tokens: tokens})
	}

	_, err := seedkit.SeedServiceAccounts(ctx, sc, accounts)
	return err
}

func (p *Profile) generatedFeatureFlags() []schema.FeatureFlag {
	generated := make([]schema.FeatureFlag, 0, generatedFeatureFlagsPerOrg)
	for i := range generatedFeatureFlagsPerOrg {
		index := i + 1
		slug := fmt.Sprintf("ops-guardrail-%02d", index)
		eventName := fmt.Sprintf("feature_flag.ops_guardrail_%02d", index)
		name := fmt.Sprintf("Ops Guardrail %02d", index)

		generated = append(generated, schema.FeatureFlag{
			Name:        name,
			Slug:        slug,
			Type:        "boolean",
			Enabled:     index%5 != 0,
			EventName:   eventName,
			Description: ptr.To("Generated operational guardrail for load testing and API filtering"),
			Variants: []schema.Variant{
				{Name: "on", Value: true, Description: "Guardrail enabled"},
				{Name: "off", Value: false, Description: "Guardrail disabled"},
			},
			Targetings: schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("off"),
			},
			Metadata: map[string]any{
				"group":          "generated",
				"index":          index,
				"fallback_value": false,
			},
		})
	}
	return generated
}

func (p *Profile) usageSeedValue(entitlementType entitlementschema.Type, threshold int32, ordinal int) int32 {
	if threshold < 0 {
		if entitlementType == entitlementschema.Boolean {
			if ordinal%2 == 0 {
				return 1
			}
			return 0
		}
		return int32(100 + (ordinal % 50))
	}

	if threshold == 0 {
		return 0
	}

	if entitlementType == entitlementschema.Boolean {
		return 1
	}

	if threshold == 1 {
		return 1
	}

	value := threshold / 2
	if value < 1 {
		value = 1
	}

	bonus := int32(ordinal % 3)
	if value+bonus < threshold {
		value += bonus
	}

	if value > threshold {
		value = threshold
	}

	return value
}

func (p *Profile) resolveInstanceLicenseName(customerIndex, profileIndex int, licenseIDs map[string]uuid.UUID) string {
	for offset := range preferredLicenseRotation {
		candidate := preferredLicenseRotation[(customerIndex+profileIndex+offset)%len(preferredLicenseRotation)]
		if _, ok := licenseIDs[candidate]; ok {
			return candidate
		}
	}

	if _, ok := licenseIDs["Pro"]; ok {
		return "Pro"
	}
	if _, ok := licenseIDs["Community"]; ok {
		return "Community"
	}

	for _, lic := range licenses {
		if _, ok := licenseIDs[lic.Name]; ok {
			return lic.Name
		}
	}

	return ""
}

func (p *Profile) versionCountForLicense(name string) int {
	if count, ok := licenseVersionsByName[name]; ok && count > 0 {
		return count
	}
	return 1
}
