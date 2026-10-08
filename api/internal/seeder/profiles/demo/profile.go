// Package demo implements the "demo" seed profile.
// It provides a single organisation with a realistic B2B SaaS dataset
// (Kaiten Sushi Shop, a fictional restaurant-platform vendor) suitable for
// documentation screenshots, feature demonstrations, and onboarding.
package demo

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/updatedeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	usersdb "github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

var _ seeder.OrganizationScopedProfile = (*Profile)(nil)

// Profile is the demo seed profile for Kaiten Sushi Shop.
type Profile struct{}

// NewProfile returns a new demo Profile instance.
func NewProfile() *Profile { return &Profile{} }

func (p *Profile) Name() string { return "demo" }

func (p *Profile) Description() string {
	return "[DEMO] Seeds one org with a realistic B2B SaaS dataset (Kaiten Sushi Shop): entitlements, licenses, customers, instances, deployment zones/releases, usage metrics, feature flags, and audit trail. The default local development and demo dataset."
}

// ── Seed entry point ───────────────────────────────────────────────────────

func (p *Profile) Seed(ctx context.Context, sc *seeder.SeederContext) error {
	slog.Info("🚀 Starting Kaiten Sushi Shop demo profile seed...")

	// Step 1: create org & users (idempotent)
	actualOrgID, ownerID, err := EnsureOrganizationAndUsers(ctx, sc)
	if err != nil {
		return err
	}

	return p.seedOrganization(ctx, sc, seeder.TargetOrganization{
		ID:          actualOrgID,
		Name:        OrganizationName,
		OwnerUserID: ownerID,
	})
}

// TokenTargets tells cmd/seeder's tokens command who should get a local dev
// switcher token for this org: all five shared TMNT identities, mirroring
// exactly what EnsureOrganizationAndUsers grants membership to below.
func TokenTargets() []seedkit.TokenTarget {
	return []seedkit.TokenTarget{
		{
			Org: organizationschema.Organization{
				ID:         OrganizationID,
				ExternalID: OrganizationExternalID,
				Name:       OrganizationName,
			},
			Users: seedkit.DevData.Users,
		},
	}
}

func (p *Profile) SeedOrganizations(ctx context.Context, sc *seeder.SeederContext, organizations []seeder.TargetOrganization) error {
	for _, organization := range organizations {
		if err := p.seedOrganization(ctx, sc, organization); err != nil {
			return err
		}
	}

	slog.Info("✅ Kaiten Sushi Shop demo profile seed completed successfully!", "organizations", len(organizations))
	return nil
}

func (p *Profile) seedOrganization(ctx context.Context, sc *seeder.SeederContext, organization seeder.TargetOrganization) error {
	slog.Info("🚀 Starting Kaiten Sushi Shop demo profile seed...", "organization_id", organization.ID, "organization_name", organization.Name)

	// Step 0: the Ops Team service account. Every later step runs as it, so
	// what the seed creates is by Ops Team rather than by the member resolved
	// as the organization's owner -- a person, or the Kaiten platform identity,
	// neither of whom did any of it. The owner only creates the account and
	// its token.
	opsTeamID, err := p.seedOpsTeam(ctx, sc.WithOrganization(organization.ID, organization.OwnerUserID))
	if err != nil {
		return err
	}

	orgCtx := sc.WithOrganization(organization.ID, opsTeamID)
	now := time.Now().UTC()

	// Step 1: entitlement groups
	if err := p.seedEntitlementGroups(ctx, orgCtx); err != nil {
		return err
	}

	// Step 2: entitlements
	entitlementIDs, entitlementSlugs, err := p.seedEntitlements(ctx, orgCtx)
	if err != nil {
		return err
	}

	// Step 3: licenses
	catalogue, err := p.seedLicenses(ctx, orgCtx)
	if err != nil {
		return err
	}

	// Step 4: associate entitlements → all license versions
	if err := p.seedLicenseEntitlements(ctx, orgCtx, entitlementSlugs, catalogue.slugs); err != nil {
		return err
	}

	// Step 5: releases + components
	releaseIDsByVersion, err := p.seedReleases(ctx, orgCtx)
	if err != nil {
		return err
	}

	// Step 6: declare typed metadata fields, then create deployment zones
	// (and their release-rollout journal) whose metadata jsonb is
	// conformant to the declared schema.
	if err := p.seedMetadataFields(ctx, orgCtx, organization.ID, opsTeamID); err != nil {
		return err
	}

	zoneIDsByKey, err := p.seedDeploymentZones(ctx, orgCtx, releaseIDsByVersion, organization.ID, now)
	if err != nil {
		return err
	}

	// Step 7: customers + instances
	instancesSeeded, err := p.seedCustomersAndInstances(ctx, orgCtx, catalogue, zoneIDsByKey, now)
	if err != nil {
		return err
	}

	// Step 7b: withdraw the versions some instances were pinned to while those
	// versions were still on sale. An instance keeps a version that is
	// archived; it just cannot be given one.
	if err := seedkit.ArchiveLicenses(ctx, orgCtx, catalogue.withdrawnLater); err != nil {
		return err
	}

	// Step 8: usage metrics
	if err := p.seedUsageMetrics(ctx, orgCtx, organization.ID, instancesSeeded, entitlementIDs); err != nil {
		return err
	}

	// Step 9: feature flags
	if err := p.seedFeatureFlags(ctx, orgCtx); err != nil {
		return err
	}

	// Step 10: service accounts & tokens
	if err := p.seedServiceAccounts(ctx, orgCtx); err != nil {
		return err
	}

	// Step 11: audit trail. Last, since it references entitlements,
	// licenses, instances, flags and deployments created above.
	instanceIDBySlug := make(map[string]uuid.UUID, len(instancesSeeded))
	for _, inst := range instancesSeeded {
		instanceIDBySlug[inst.Slug] = inst.ID
	}
	refs := auditRefs{
		instances:    instanceIDBySlug,
		zones:        zoneIDsByKey,
		releases:     releaseIDsByVersion,
		licenses:     catalogue.current,
		licenseSlugs: catalogue.currentSlug,
		entitlements: entitlementIDs,
	}
	if err := p.seedAuditTrail(ctx, orgCtx, organization.ID, now, refs); err != nil {
		return err
	}

	slog.Info("✅ Kaiten Sushi Shop demo profile seed completed successfully!", "organization_id", organization.ID, "organization_name", organization.Name)
	return nil
}

// ── Org & Users ────────────────────────────────────────────────────────────

// EnsureOrganizationAndUsers ensures the Kaiten Sushi Shop org exists and
// that all five shared TMNT identities (seedkit.DevData.Users) are members
// of it, without touching any product data. Exported so the dev profile can
// call it directly: for the OSS-only local stack, this is the entire org
// shell a developer needs to log into before (or without ever) running the
// rest of this profile's product-data seed.
func EnsureOrganizationAndUsers(ctx context.Context, sc *seeder.SeederContext) (uuid.UUID, uuid.UUID, error) {
	slog.Info("👥 Ensuring organization and users...")

	actualOrgID, err := sc.EnsureOrganization(ctx, organizationdb.CreateOrganizationParams{
		ID:         OrganizationID,
		Name:       OrganizationName,
		ExternalID: OrganizationExternalID,
	})
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	slog.Info("   ✓ Ensured organization: Kaiten Sushi Shop", "id", actualOrgID)

	actualUserIDs := make(map[string]uuid.UUID, len(seedkit.DevData.Users))
	for _, u := range seedkit.DevData.Users {
		var email *string
		if u.Email != "" {
			email = ptr.To(u.Email)
		}
		id, err := sc.EnsureUser(ctx, usersdb.CreateUserParams{
			ID:         u.ID,
			ExternalID: u.ExternalID,
			Email:      email,
			Name:       u.Name,
		})
		if err != nil {
			return uuid.Nil, uuid.Nil, err
		}
		actualUserIDs[u.ExternalID] = id
	}

	for extID, userID := range actualUserIDs {
		if err := sc.EnsureUserOnOrganization(ctx, organizationdb.CreateUserOnOrganizationParams{
			OrganizationID: actualOrgID,
			UserID:         userID,
		}); err != nil {
			return uuid.Nil, uuid.Nil, fmt.Errorf("membership %s: %w", extID, err)
		}
	}
	slog.Info("   ✓ Ensured users and memberships", "count", len(actualUserIDs))

	ownerID := actualUserIDs[seedkit.DevData.PrimaryUserExternalID]
	return actualOrgID, ownerID, nil
}

// ── Entitlements ───────────────────────────────────────────────────────────

func (p *Profile) seedEntitlements(ctx context.Context, sc *seeder.SeederContext) (map[string]uuid.UUID, map[string]string, error) {
	slog.Info("🎫 Creating entitlements...")

	ids := make(map[string]uuid.UUID, len(entitlements))
	slugs := make(map[string]string, len(entitlements))

	for _, ent := range entitlements {
		cmd := &createentitlement.Command{
			Name:              ent.Name,
			Slug:              ptr.To(ent.Slug),
			Description:       ptr.To(ent.Description),
			GroupSlugs:        ent.GroupSlugs,
			Type:              ent.Type,
			AggregationMethod: ent.AggregationMethod,
			ResetPeriod:       ent.ResetPeriod,
			ResetAnchor:       ent.ResetAnchor,
		}
		created, err := sc.Entitlements.CreateEntitlement.Execute(ctx, cmd)
		if err != nil {
			return nil, nil, fmt.Errorf("entitlement %q: %w", ent.Name, err)
		}
		ids[ent.Slug] = created.ID
		slugs[ent.Slug] = created.Slug
		slog.Info("   ✓ Created entitlement", "name", ent.Name)
	}
	return ids, slugs, nil
}

func (p *Profile) seedEntitlementGroups(ctx context.Context, sc *seeder.SeederContext) error {
	slog.Info("🗂️ Creating entitlement groups...")
	return seedkit.SeedEntitlementGroups(ctx, sc, entitlementGroups)
}

// ── Licenses ───────────────────────────────────────────────────────────────

// seededCatalogue is what seedLicenses leaves for the steps after it, keyed by
// license name.
type seededCatalogue struct {
	// current is the version each family resolves to: what an instance is
	// pinned to unless it names a version, and what an audit entry about the
	// product opens. currentSlug is that same version's slug.
	current     map[string]uuid.UUID
	currentSlug map[string]string
	// versions and slugs describe every version, oldest first.
	versions map[string][]uuid.UUID
	slugs    map[string][]string
	// withdrawnLater are the archived versions an instance is pinned to. No
	// instance can be given an archived version, so these stay on sale until
	// seedCustomersAndInstances has pinned their instances, and are archived
	// right after.
	withdrawnLater []string
}

// instanceLicenseID is the version inst is pinned to: the one it names, or
// the one its family resolves to.
func (c seededCatalogue) instanceLicenseID(inst instanceDef) (uuid.UUID, error) {
	if inst.LicenseVersion == 0 {
		id, ok := c.current[inst.LicenseName]
		if !ok {
			return uuid.Nil, fmt.Errorf("license %q not found", inst.LicenseName)
		}
		return id, nil
	}

	versions := c.versions[inst.LicenseName]
	if inst.LicenseVersion < 0 || inst.LicenseVersion > len(versions) {
		return uuid.Nil, fmt.Errorf("license %q has no version %d", inst.LicenseName, inst.LicenseVersion)
	}
	return versions[inst.LicenseVersion-1], nil
}

// pinnedToVersion reports whether an instance names version vi (0-based) of
// the license called name.
func pinnedToVersion(name string, vi int) bool {
	for _, cust := range customers {
		for _, inst := range cust.Instances {
			if inst.LicenseName == name && inst.LicenseVersion == vi+1 {
				return true
			}
		}
	}
	return false
}

func (p *Profile) seedLicenses(ctx context.Context, sc *seeder.SeederContext) (seededCatalogue, error) {
	slog.Info("📜 Creating licenses...")

	catalogue := seededCatalogue{
		current:     make(map[string]uuid.UUID),
		currentSlug: make(map[string]string),
		versions:    make(map[string][]uuid.UUID),
		slugs:       make(map[string][]string),
	}

	for _, lic := range licenses {
		var familyID uuid.UUID
		var toArchive []string
		var heldBack []uuid.UUID

		for vi, version := range lic.Versions {
			command := &createlicense.Command{
				Name:           lic.Name,
				Description:    version.Description,
				Type:           lic.Type,
				VersionName:    ptr.To(fmt.Sprintf("%s v%d", lic.Name, vi+1)),
				IsDefault:      version.IsDefault,
				LifecycleState: seedkit.LicenseCreationState(version.LifecycleState),
			}
			// The first version opens the family under lic.Slug, and so takes
			// that slug itself. Later versions name the family by it -- a shared
			// name does not make two rows the same product -- and get the derived
			// {slug}-v{n}.
			if vi == 0 {
				command.Slug = ptr.To(lic.Slug)
			} else {
				command.FamilySlug = ptr.To(lic.Slug)
			}
			created, err := sc.Licenses.CreateLicense.Execute(ctx, command)
			if err != nil {
				return seededCatalogue{}, fmt.Errorf("license %q v%d: %w", lic.Name, vi+1, err)
			}
			if vi == 0 {
				familyID = created.FamilyID
			}
			catalogue.versions[lic.Name] = append(catalogue.versions[lic.Name], created.ID)
			catalogue.slugs[lic.Name] = append(catalogue.slugs[lic.Name], created.Slug)
			switch {
			case version.LifecycleState != licenseschema.Archived:
			case pinnedToVersion(lic.Name, vi):
				heldBack = append(heldBack, created.ID)
				catalogue.withdrawnLater = append(catalogue.withdrawnLater, created.Slug)
			default:
				toArchive = append(toArchive, created.Slug)
			}
		}

		// Withdrawn now that the later versions exist, the way a vendor retires
		// one -- except those an instance is still to be pinned to.
		if err := seedkit.ArchiveLicenses(ctx, sc, toArchive); err != nil {
			return seededCatalogue{}, fmt.Errorf("license %q: %w", lic.Name, err)
		}

		// What instances get pinned to: whatever the family currently resolves
		// to. Asked of the query the family endpoints answer with, so the demo
		// data cannot drift from the rule it exists to demonstrate -- and
		// deliberately not "the last version created", since the newest version of
		// a family can be a draft and no instance may be pinned to something the
		// catalogue will not serve.
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
		// A version held back is still on sale at this point, so it counts in
		// the resolution above. It must not be what the family resolves to, or
		// archiving it later would move the family's other instances' version
		// from under them.
		if slices.Contains(heldBack, served[0].ID) {
			return seededCatalogue{}, fmt.Errorf(
				"license %q resolves to v%d, which is archived once its instances exist; give the family a default or a newer published version",
				lic.Name, served[0].Version)
		}
		catalogue.current[lic.Name] = served[0].ID
		catalogue.currentSlug[lic.Name] = served[0].Slug
		slog.Info("   ✓ Created license versions", "name", lic.Name, "versions", len(lic.Versions))
	}
	return catalogue, nil
}

// ── License Entitlements ───────────────────────────────────────────────────

// seedLicenseEntitlements associates entitlements to every version of each
// license, each with what that version grants (versionGrants).
func (p *Profile) seedLicenseEntitlements(
	ctx context.Context,
	sc *seeder.SeederContext,
	entitlementSlugs map[string]string,
	allLicenseSlugs map[string][]string,
) error {
	slog.Info("🔗 Associating entitlements to all license versions...")

	for _, lic := range licenses {
		slugs := allLicenseSlugs[lic.Name]
		if len(slugs) != len(lic.Versions) {
			return fmt.Errorf("license %q: %d version slugs for %d versions", lic.Name, len(slugs), len(lic.Versions))
		}
		for vi, licSlug := range slugs {
			for entSlug, grant := range versionGrants(lic, vi) {
				actualEntSlug, ok := entitlementSlugs[entSlug]
				if !ok {
					return fmt.Errorf("entitlement %q slug not found", entSlug)
				}
				if err := sc.Licenses.AssociateEntitlementWithLicense.Execute(ctx, licSlug, &associateentitlementwithlicense.Command{
					EntitlementSlug:                actualEntSlug,
					Value:                          grant.Value,
					LimitCapExceededOveragePercent: grant.LimitCapExceededOveragePercent,
				}); err != nil {
					return fmt.Errorf("associate %q → %q (%q): %w", entSlug, lic.Name, licSlug, err)
				}
			}
			slog.Info("   ✓ Associated entitlements", "license", lic.Name, "slug", licSlug)
		}
	}
	return nil
}

// ── Releases & Components ─────────────────────────────────────────────────

func (p *Profile) seedReleases(ctx context.Context, sc *seeder.SeederContext) (map[string]uuid.UUID, error) {
	slog.Info("📦 Creating releases and components...")

	releaseIDsByVersion := make(map[string]uuid.UUID)
	componentIDsByVersion := make(map[string][]uuid.UUID)
	componentIDsBySlug := make(map[string]uuid.UUID)

	for _, rel := range releases {
		componentIDs := make([]uuid.UUID, 0)

		// inherit previous release's components
		if rel.PreviousVersion != "" {
			prev, ok := componentIDsByVersion[rel.PreviousVersion]
			if !ok {
				return nil, fmt.Errorf("release %q references unknown previous version %q", rel.Version, rel.PreviousVersion)
			}
			componentIDs = append(componentIDs, prev...)
		}

		for _, patch := range rel.Patches {
			switch patch.Op {
			case opAdd:
				comp, err := sc.Components.CreateComponent.Execute(ctx, &createcomponent.Command{
					Name:        *patch.Name,
					Version:     *patch.Version,
					Slug:        patch.Slug,
					Description: patch.Description,
				})
				if err != nil {
					return nil, fmt.Errorf("component %q: %w", *patch.Name, err)
				}
				componentIDs = append(componentIDs, comp.ID)
				componentIDsBySlug[comp.Slug] = comp.ID

			case opRemove:
				cid, ok := componentIDsBySlug[*patch.RemoveSlug]
				if !ok {
					return nil, fmt.Errorf("release %q: cannot remove unknown component slug %q", rel.Version, *patch.RemoveSlug)
				}
				filtered := make([]uuid.UUID, 0, len(componentIDs)-1)
				for _, id := range componentIDs {
					if id != cid {
						filtered = append(filtered, id)
					}
				}
				componentIDs = filtered
			}
		}

		created, err := sc.Releases.CreateRelease.Execute(ctx, &createrelease.Command{
			Version:      rel.Version,
			Description:  ptr.To(rel.Description),
			ComponentIDs: componentIDs,
		})
		if err != nil {
			return nil, fmt.Errorf("release %q: %w", rel.Version, err)
		}

		releaseIDsByVersion[rel.Version] = created.ID
		componentIDsByVersion[rel.Version] = append([]uuid.UUID(nil), componentIDs...)
		slog.Info("   ✓ Created release", "version", rel.Version)
	}

	return releaseIDsByVersion, nil
}

// ── Deployment Zones ───────────────────────────────────────────────────────

// seedMetadataFields declares the org-scoped MetadataField rows for
// DEPLOYMENT_ZONE and INSTANCE. A later change will replace the raw query call with
// the createmetadatafield use-case once it lands.
func (p *Profile) seedMetadataFields(
	ctx context.Context,
	sc *seeder.SeederContext,
	orgID uuid.UUID,
	userID uuid.UUID,
) error {
	return seedkit.SeedMetadataFields(ctx, sc, orgID, userID, metadataFieldsDeploymentZone, metadataFieldsInstance)
}

func (p *Profile) seedDeploymentZones(
	ctx context.Context,
	sc *seeder.SeederContext,
	releaseIDsByVersion map[string]uuid.UUID,
	orgID uuid.UUID,
	now time.Time,
) (map[string]uuid.UUID, error) {
	slog.Info("🌍 Creating deployment zones...")

	zoneIDsByKey := make(map[string]uuid.UUID, len(deploymentZones))
	zoneDefByKey := make(map[string]deploymentZoneDef, len(deploymentZones))
	firstDeploymentByZone := make(map[string]deploymentDef, len(deploymentZones))
	for _, d := range deployments {
		if _, ok := firstDeploymentByZone[d.ZoneKey]; !ok {
			firstDeploymentByZone[d.ZoneKey] = d
		}
	}

	for _, dz := range deploymentZones {
		zoneDefByKey[dz.Key] = dz

		var releaseID *uuid.UUID
		if first, ok := firstDeploymentByZone[dz.Key]; ok {
			rid, ok := releaseIDsByVersion[first.ReleaseVersion]
			if !ok {
				return nil, fmt.Errorf("zone %q references unknown release %q", dz.Name, first.ReleaseVersion)
			}
			releaseID = ptr.To(rid)
		}

		created, err := sc.DeploymentZones.CreateDeploymentZone.Execute(ctx, &createdeploymentzone.Command{
			Name:        dz.Name,
			Slug:        ptr.To(dz.Key),
			Type:        dz.Type,
			Description: dz.Description,
			Metadata:    dz.MetadataPayload(),
			ReleaseID:   releaseID,
		})
		if err != nil {
			return nil, fmt.Errorf("deployment zone %q: %w", dz.Name, err)
		}

		zoneIDsByKey[dz.Key] = created.ID
		slog.Info("   ✓ Created deployment zone", "name", dz.Name)
	}

	if err := p.seedDeploymentJournal(ctx, sc, orgID, now, zoneIDsByKey, zoneDefByKey, releaseIDsByVersion); err != nil {
		return nil, err
	}

	return zoneIDsByKey, nil
}

// seedDeploymentJournal replays every deployment after each zone's initial
// release (already recorded by CreateDeploymentZone above) through
// UpdateDeploymentZone -- the same path a real release rollout takes -- then
// backdates each resulting `deployment` row to the source dataset's
// timeline. A zone with only one entry in `deployments` (Sakura Dedicated)
// never reaches the UpdateDeploymentZone branch, which is the point: it's
// the dataset's "pending upgrade" zone.
func (p *Profile) seedDeploymentJournal(
	ctx context.Context,
	sc *seeder.SeederContext,
	orgID uuid.UUID,
	now time.Time,
	zoneIDsByKey map[string]uuid.UUID,
	zoneDefByKey map[string]deploymentZoneDef,
	releaseIDsByVersion map[string]uuid.UUID,
) error {
	seenZone := make(map[string]bool, len(zoneIDsByKey))

	for _, d := range deployments {
		zoneID, ok := zoneIDsByKey[d.ZoneKey]
		if !ok {
			return fmt.Errorf("deployment references unknown zone %q", d.ZoneKey)
		}
		releaseID, ok := releaseIDsByVersion[d.ReleaseVersion]
		if !ok {
			return fmt.Errorf("deployment references unknown release %q", d.ReleaseVersion)
		}

		if seenZone[d.ZoneKey] {
			zone := zoneDefByKey[d.ZoneKey]
			if err := sc.DeploymentZones.UpdateDeploymentZone.Execute(ctx, &updatedeploymentzone.Command{
				Name:        zone.Name,
				Type:        zone.Type,
				Description: zone.Description,
				Metadata:    zone.MetadataPayload(),
				ReleaseID:   ptr.To(releaseID),
			}, d.ZoneKey); err != nil {
				return fmt.Errorf("deploy %q to zone %q: %w", d.ReleaseVersion, d.ZoneKey, err)
			}
		}
		seenZone[d.ZoneKey] = true

		if err := sc.Exec(ctx, `
			UPDATE deployment SET created_at = $1
			WHERE deployment_zone_id = $2 AND release_id = $3 AND organization_id = $4
		`, relativeToNow(d.CreatedAt, now), zoneID, releaseID, orgID); err != nil {
			return fmt.Errorf("backdate deployment %q/%q: %w", d.ZoneKey, d.ReleaseVersion, err)
		}
	}

	return nil
}

// ── Customers & Instances ──────────────────────────────────────────────────

type seededInstance struct {
	ID          uuid.UUID
	Slug        string
	LicenseName string
	CustomerID  uuid.UUID
	UsageValues map[string]usageEntry
}

func (p *Profile) seedCustomersAndInstances(
	ctx context.Context,
	orgCtx *seeder.SeederContext,
	catalogue seededCatalogue,
	zoneIDsByKey map[string]uuid.UUID,
	now time.Time,
) ([]seededInstance, error) {
	slog.Info("🏢 Creating customers and instances...")

	var allInstances []seededInstance

	for _, cust := range customers {
		created, err := orgCtx.Customers.CreateCustomer.Execute(ctx, &createcustomer.Command{
			Name:               cust.Name,
			Slug:               ptr.To(cust.Slug),
			ExternalCustomerID: cust.ExternalCustomerID,
		})
		if err != nil {
			return nil, fmt.Errorf("customer %q: %w", cust.Name, err)
		}
		slog.Info("   ✓ Created customer", "name", cust.Name)

		// License attaches to the instance, not the customer -- Sakura
		// Tokyo's two instances below deliberately resolve two different
		// licenses for the same customer.
		for _, inst := range cust.Instances {
			licenseID, err := catalogue.instanceLicenseID(inst)
			if err != nil {
				return nil, fmt.Errorf("instance %q %s: %w", cust.Name, inst.NameSuffix, err)
			}
			zoneID, ok := zoneIDsByKey[inst.ZoneKey]
			if !ok {
				return nil, fmt.Errorf("zone key %q not found for instance %q %s", inst.ZoneKey, cust.Name, inst.NameSuffix)
			}

			instanceName := fmt.Sprintf("%s %s", cust.Name, inst.NameSuffix)

			createdInst, err := orgCtx.Instances.CreateInstance.Execute(ctx, &createinstance.Command{
				Name:             instanceName,
				Slug:             ptr.To(inst.Slug),
				Description:      inst.Description,
				CustomerID:       created.ID,
				LicenseID:        licenseID,
				DeploymentZoneID: &zoneID,
				StartLicenseDate: now,
				EndLicenseDate:   now.AddDate(1, 0, 0),
				Metadata: map[string]any{
					"environment": inst.Environment,
				},
			})
			if err != nil {
				return nil, fmt.Errorf("instance %q: %w", instanceName, err)
			}

			// CreateInstance has no status/lifecycle fields, so set the seeded
			// commercial signals directly as initial state.
			status := inst.Status
			if status == "" {
				status = instanceschema.InstanceStatusHealthy
			}
			if err := orgCtx.Exec(
				ctx,
				`UPDATE instance SET status = $1::instance_status, lifecycle_stage = $2 WHERE id = $3`,
				string(status), inst.LifecycleStage, createdInst.ID,
			); err != nil {
				return nil, fmt.Errorf("set status/lifecycle for instance %q: %w", instanceName, err)
			}

			if !inst.CreatedAt.IsZero() {
				if err := orgCtx.Exec(ctx,
					`UPDATE instance SET created_at = $1, updated_at = $1 WHERE id = $2`,
					relativeToNow(inst.CreatedAt, now), createdInst.ID,
				); err != nil {
					return nil, fmt.Errorf("backdate instance %q: %w", instanceName, err)
				}
			}

			allInstances = append(allInstances, seededInstance{
				ID:          createdInst.ID,
				Slug:        inst.Slug,
				LicenseName: inst.LicenseName,
				CustomerID:  created.ID,
				UsageValues: inst.UsageValues,
			})
			slog.Info("   ✓ Created instance", "name", instanceName)
		}
	}

	return allInstances, nil
}

// ── Usage Metrics ──────────────────────────────────────────────────────────

func (p *Profile) seedUsageMetrics(
	ctx context.Context,
	orgCtx *seeder.SeederContext,
	orgID uuid.UUID,
	instances []seededInstance,
	entitlementIDs map[string]uuid.UUID,
) error {
	slog.Info("📊 Reporting entitlement usage...")

	for _, inst := range instances {
		if len(inst.UsageValues) == 0 {
			continue
		}

		// Iterate in deterministic order
		for _, entSlug := range usageEntitlementOrder {
			usage, ok := inst.UsageValues[entSlug]
			if !ok {
				continue
			}

			if _, ok := entitlementIDs[entSlug]; !ok {
				continue
			}

			// Written with its usage_ledger row, so the journal explains the
			// seeded counter. A periodic entitlement (monthly-orders resets
			// MONTH/CALENDAR) lands in its current window, which is what the
			// dashboard shows; the others are lifetime counters.
			if err := reportentitlementusagemetric.WriteSnapshot(ctx, uow.NewUnitOfWork(orgCtx.Pool()), reportentitlementusagemetric.Snapshot{
				OrganizationID:  orgID,
				InstanceSlug:    inst.Slug,
				EntitlementSlug: entSlug,
				Value:           float64(usage.Value),
				EventCount:      usage.EventCount,
			}); err != nil {
				return fmt.Errorf("report usage %q/%q: %w", inst.ID, entSlug, err)
			}
		}
	}

	slog.Info("   ✓ Reported entitlement usage")
	return nil
}

// ── Audit Trail ────────────────────────────────────────────────────────────

// seedAuditTrail reproduces the source dataset's audit_trail entries via a
// direct INSERT, the same mechanism this profile already used for its usage
// audit rows: the seeder CLI runs as a one-shot process and never runs the
// outbox/CDC consumer, so nothing processes the outbox events these
// use-cases already publish into audit_trail rows during a seed run. This is
// the "declarative fallback" the source dataset's own notes describe.
// auditRefs is everything a seeded audit payload can name through a seedRef:
// the rows the steps before the audit trail created, keyed the way data.go
// writes them.
type auditRefs struct {
	instances    map[string]uuid.UUID // by slug
	zones        map[string]uuid.UUID // by key
	releases     map[string]uuid.UUID // by version
	licenses     map[string]uuid.UUID // by name: the version its family serves
	licenseSlugs map[string]string    // by name: that same version's slug
	entitlements map[string]uuid.UUID // by slug
}

// payload swaps each seedRef in a payload for the value it stands for. A key it
// cannot resolve is a typo in data.go, and fails the seed rather than writing a
// payload that names nothing.
func (r auditRefs) payload(raw map[string]any) (map[string]any, error) {
	resolved := make(map[string]any, len(raw))
	for key, value := range raw {
		ref, ok := value.(seedRef)
		if !ok {
			resolved[key] = value
			continue
		}

		seeded, err := r.resolve(ref)
		if err != nil {
			return nil, fmt.Errorf("payload key %q: %w", key, err)
		}
		resolved[key] = seeded
	}

	return resolved, nil
}

func (r auditRefs) resolve(ref seedRef) (any, error) {
	var (
		value any
		found bool
	)

	switch ref.kind {
	case refInstanceID:
		value, found = r.instances[ref.key]
	case refZoneID:
		value, found = r.zones[ref.key]
	case refReleaseID:
		value, found = r.releases[ref.key]
	case refLicenseID:
		value, found = r.licenses[ref.key]
	case refLicenseSlug:
		value, found = r.licenseSlugs[ref.key]
	case refEntitlementID:
		value, found = r.entitlements[ref.key]
	}

	if !found {
		return nil, fmt.Errorf("nothing seeded answers to %q", ref.key)
	}

	return value, nil
}

func (p *Profile) seedAuditTrail(
	ctx context.Context,
	orgCtx *seeder.SeederContext,
	orgID uuid.UUID,
	now time.Time,
	refs auditRefs,
) error {
	slog.Info("📜 Creating audit trail...")

	for _, ev := range auditTrail {
		var instanceID *uuid.UUID
		if ev.InstanceSlug != "" {
			id, ok := refs.instances[ev.InstanceSlug]
			if !ok {
				return fmt.Errorf("audit event references unknown instance %q", ev.InstanceSlug)
			}
			instanceID = &id
		}

		payload, err := refs.payload(ev.Payload)
		if err != nil {
			return fmt.Errorf("audit event %q: %w", ev.Name, err)
		}

		payloadJSON, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("marshal audit payload for %q: %w", ev.Name, err)
		}

		if err := orgCtx.Exec(ctx, `
			INSERT INTO audit_trail (organization_id, instance_id, event_name, event_type, occurred_at, payload)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb)
		`, orgID, instanceID, ev.Name, ev.Type, relativeToNow(ev.OccurredAt, now), string(payloadJSON)); err != nil {
			return fmt.Errorf("audit trail event %q: %w", ev.Name, err)
		}
	}

	slog.Info("   ✓ Created audit trail", "events", len(auditTrail))
	return nil
}

// ── Feature Flags ──────────────────────────────────────────────────────────

func (p *Profile) seedFeatureFlags(ctx context.Context, sc *seeder.SeederContext) error {
	slog.Info("🚩 Creating feature flags...")
	return seedkit.SeedFeatureFlags(ctx, sc, featureFlags, false)
}

// ── Service Accounts & Tokens ─────────────────────────────────────────────

// seedOpsTeam creates the Ops Team service account the rest of the seed acts
// as, and returns its user ID. Its token carries the console's "Control plane"
// preset (TOKEN_PRESETS.controlPlane in app/src/features/service-accounts)
// plus the three modules the dataset also writes -- entitlements, feature flags
// and metadata fields -- the same account the hosted demo seed creates, which
// makes every call with that token. This seed calls the use cases directly,
// which check no scope, so here the token describes the account rather than
// bounding what the seed may do as it.
func (p *Profile) seedOpsTeam(ctx context.Context, sc *seeder.SeederContext) (uuid.UUID, error) {
	slog.Info("🛠️ Creating the Ops Team service account...")

	sa, _, err := seedkit.SeedServiceAccount(ctx, sc, seedkit.ServiceAccountDef{
		Name: "Ops Team",
		Slug: ptr.To("ops-team"),
		Tokens: []seedkit.TokenDef{
			{
				Name: "ops-team-token",
				Scopes: []string{
					scope.Write(scope.Instances),
					scope.Write(scope.Licenses),
					scope.Write(scope.Customers),
					scope.Write(scope.DeploymentZones),
					scope.Write(scope.Releases),
					scope.Write(scope.Components),
					scope.Write(scope.Organizations),
					scope.Write(scope.Tokens),
					scope.Write(scope.Entitlements),
					scope.Write(scope.FeatureFlags),
					scope.Write(scope.MetadataFields),
				},
			},
		},
	})
	if err != nil {
		return uuid.Nil, err
	}

	slog.Info("   ✓ Created service account", "name", sa.Name)
	return sa.ID, nil
}

func (p *Profile) seedServiceAccounts(ctx context.Context, sc *seeder.SeederContext) error {
	slog.Info("🤖 Creating service accounts and tokens...")

	accounts := []seedkit.ServiceAccountDef{
		{
			Name: "SDK",
			Slug: ptr.To("sdk"),
			Tokens: []seedkit.TokenDef{
				{
					Name: "sdk-token",
					Scopes: []string{
						scope.Read(scope.FeatureFlags),
						scope.Read(scope.Entitlements),
					},
				},
			},
		},
	}

	_, err := seedkit.SeedServiceAccounts(ctx, sc, accounts)
	return err
}
