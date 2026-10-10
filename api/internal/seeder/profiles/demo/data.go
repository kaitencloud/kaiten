package demo

import (
	"fmt"
	"maps"
	"slices"
	"time"

	"github.com/google/uuid"

	deploymentzoneevents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	entitlementevents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	featureflagevents "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licenseevents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// datasetReferenceDate is "today" from the Kaiten Sushi Shop dataset's own
// point of view (its _meta.date). Every backdated timestamp below (instance
// creation, the deployment journal, the audit trail) is expressed as an
// absolute time under this reference and re-anchored onto the seeder's
// actual run time by relativeToNow, so the dataset's internal chronology
// (ordering, day-scale gaps) survives no matter when `demo` is seeded.
var datasetReferenceDate = time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC)

func relativeToNow(t time.Time, now time.Time) time.Time {
	return now.Add(t.Sub(datasetReferenceDate))
}

var metadataFieldsDeploymentZone = []seedkit.MetadataFieldDef{
	{
		Key:          "compliance_profile",
		Label:        "Compliance profile",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		DisplayOrder: 1,
		JSONSchema: map[string]any{
			"type": "string",
			"enum": []string{"standard", "pci-dss"},
		},
	},
	{
		Key:          "region",
		Label:        "Cloud region",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		DisplayOrder: 2,
		JSONSchema: map[string]any{
			"type": "string",
		},
	},
	{
		Key:          "dedicated",
		Label:        "Dedicated",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		DisplayOrder: 3,
		JSONSchema: map[string]any{
			"type": "boolean",
		},
	},
}

var metadataFieldsInstance = []seedkit.MetadataFieldDef{
	{
		Key:          "environment",
		Label:        "Environment",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		DisplayOrder: 1,
		JSONSchema: map[string]any{
			"type": "string",
			"enum": []string{"production", "staging", "demo"},
		},
	},
}

// ── Organization identity ────────────────────────────────────────────────────
//
// Exported: cmd/seeder's tokens command needs these to mint dev switcher
// tokens for this org without duplicating them (see TokenTargets below), and
// the dev profile needs them to ensure this same org as its own org shell
// (see EnsureOrganizationAndUsers).
//
// Members are seedkit.DevData's five TMNT identities, not a bespoke set --
// the source dataset has no `users` section of its own (only the machine
// `sdk` service account below), and reusing the shared dev identities is
// what makes this org reachable through the same local dev token switcher
// every other local org uses.
const (
	OrganizationExternalID = "seed-kaiten-sushi-shop"
	OrganizationName       = "Kaiten Sushi Shop"
)

var OrganizationID = uuid.MustParse("55555555-5555-5555-5555-555555555555")

// ── Zone keys ──────────────────────────────────────────────────────────────
// These double as the deployment zones' slugs (passed explicitly at create
// time) so the source dataset's own zone slugs survive verbatim.

const (
	zoneKeySharedAPAC      = "shared-apac"
	zoneKeySharedEU        = "shared-eu"
	zoneKeySakuraDedicated = "sakura-dedicated"
)

// ── Entitlements ───────────────────────────────────────────────────────────

// entitlementDef is one catalogue entitlement.
//
// ResetPeriod and ResetAnchor make a NUMBER entitlement periodic: its usage is
// counted in a window that restarts on that cadence instead of over the life
// of the instance. Both nil is a lifetime counter. They go to create-entitlement
// as written, and seedUsageMetrics reads them to store each usage row in the
// window its entitlement measures (usagePeriodStart), so which entitlements
// reset is said once, here. The anchor is spelled out even where it is the
// default the API would fill in, because the seed computes the window from it.
//
// The presentation fields are what customer-facing components render: a
// pricing table or a usage meter shows the user-facing entitlements, in
// DisplayOrder, with their icon and unit labels, and hides the rest. Unit
// labels go on NUMBER entitlements only, both or neither.
type entitlementDef struct {
	Name              string
	Slug              string
	Description       string
	GroupSlugs        []string
	Type              entitlementschema.Type
	AggregationMethod *entitlementschema.AggregationMethod
	ResetPeriod       *period.ResetPeriod
	ResetAnchor       *period.ResetAnchor
	Icon              string
	UnitSingular      *string
	UnitPlural        *string
	UserFacing        bool
	DisplayOrder      int32
}

var entitlementGroups = []seedkit.EntitlementGroupDef{
	{Name: "Delivery", Slug: "delivery"},
	{Name: "Restaurant Operations", Slug: "restaurant-operations"},
}

var entitlements = []entitlementDef{
	{
		Name:              "Menu Items",
		Slug:              "menu-items",
		Description:       "Number of dishes a restaurant can publish on its menu.",
		GroupSlugs:        []string{"restaurant-operations"},
		Type:              entitlementschema.Number,
		AggregationMethod: ptr.To(entitlementschema.Latest),
		Icon:              "lucide:utensils",
		UnitSingular:      ptr.To("menu item"),
		UnitPlural:        ptr.To("menu items"),
		UserFacing:        true,
		DisplayOrder:      1,
	},
	{
		Name:              "Monthly Orders",
		Slug:              "monthly-orders",
		Description:       "Orders a restaurant can process per month.",
		GroupSlugs:        []string{"restaurant-operations"},
		Type:              entitlementschema.Number,
		AggregationMethod: ptr.To(entitlementschema.Sum),
		// The one periodic entitlement: orders count per calendar month, as
		// its name says. Menu items, delivery drivers and locations are
		// lifetime counters.
		ResetPeriod:  ptr.To(period.Month),
		ResetAnchor:  ptr.To(period.Calendar),
		Icon:         "lucide:shopping-cart",
		UnitSingular: ptr.To("order"),
		UnitPlural:   ptr.To("orders"),
		UserFacing:   true,
		DisplayOrder: 2,
	},
	{
		Name:              "Delivery Drivers",
		Slug:              "delivery-drivers",
		Description:       "Delivery driver accounts a restaurant can register.",
		GroupSlugs:        []string{"delivery"},
		Type:              entitlementschema.Number,
		AggregationMethod: ptr.To(entitlementschema.Latest),
		Icon:              "lucide:bike",
		UnitSingular:      ptr.To("driver"),
		UnitPlural:        ptr.To("drivers"),
		UserFacing:        true,
		DisplayOrder:      3,
	},
	{
		Name:              "Locations",
		Slug:              "locations",
		Description:       "Physical restaurant locations under one account.",
		GroupSlugs:        []string{"restaurant-operations"},
		Type:              entitlementschema.Number,
		AggregationMethod: ptr.To(entitlementschema.Latest),
		Icon:              "lucide:map-pin",
		UnitSingular:      ptr.To("location"),
		UnitPlural:        ptr.To("locations"),
		UserFacing:        true,
		DisplayOrder:      4,
	},
	{
		Name:         "Delivery Tracking",
		Slug:         "delivery-tracking",
		Description:  "Real-time delivery tracking for end customers.",
		GroupSlugs:   []string{"delivery"},
		Type:         entitlementschema.Boolean,
		Icon:         "lucide:navigation",
		UserFacing:   true,
		DisplayOrder: 5,
	},
	{
		Name:        "Support Tier",
		Slug:        "support-tier",
		Description: "Support channel and response commitment for the restaurant.",
		// The source dataset's entitlement_groups only cover the other five
		// entitlements. Grouped here anyway so every entitlement belongs to
		// at least one group, per data_test.go's coverage check.
		GroupSlugs:   []string{"restaurant-operations"},
		Type:         entitlementschema.Config,
		Icon:         "lucide:life-buoy",
		UserFacing:   true,
		DisplayOrder: 6,
	},
}

// entitlementBySlug is the definition of the entitlement slugged slug, the key
// usage values and grants name it by.
func entitlementBySlug(slug string) (entitlementDef, bool) {
	for _, ent := range entitlements {
		if ent.Slug == slug {
			return ent, true
		}
	}
	return entitlementDef{}, false
}

// ── Licenses ───────────────────────────────────────────────────────────────

// licenseVersionDef is one version of a license family: the description it
// carries, whether it may be served, whether it is the version the family
// puts forward, and what it grants differently from the rest of its family.
//
// LifecycleState is the state the version ends the seed in. An Archived version
// is not created that way -- create-license refuses it -- but created Published
// and then archived, see seedkit.LicenseCreationState.
//
// IsDefault sits here rather than on the family because that is where the
// column is: at most one version of a family may hold it, and only a Published
// one may (license_default_must_be_published_check). data_test.go checks both
// without needing a database.
//
// Grants overrides the family's grants (licenseEntitlementValues) for this
// version only. A revision is a change in what a product grants, not only in
// how it is described, so every family with several versions has at least one
// that differs (data_test.go). Keys must be entitlements the family grants.
type licenseVersionDef struct {
	Description    string
	LifecycleState licenseschema.LifecycleState
	IsDefault      bool
	Grants         map[string]entitlementGrant
}

// licenseDef is one product. Slug is its family's slug, which is also its
// first version's: later versions get {Slug}-v{n}. It is fixed rather than
// generated so the catalogue has the same addresses on every seed -- the family
// slug is the stable handle a pricing page or a doc points at.
type licenseDef struct {
	Name     string
	Slug     string
	Type     licenseschema.Type
	Versions []licenseVersionDef // oldest first
}

// The three families exist to show the three shapes a catalogue actually has,
// because a demo where every product has exactly one published version shows
// none of what license families are for.
var licenses = []licenseDef{
	{
		// The simple case: one version, which is its family's default.
		Name: "Starter",
		Slug: "starter",
		Type: licenseschema.Community,
		Versions: []licenseVersionDef{
			{
				Description:    "Entry tier for single-location restaurants getting started.",
				LifecycleState: licenseschema.Published,
				IsDefault:      true,
			},
		},
	},
	{
		// A product revised once whose vendor still puts the first version
		// forward. v2 adds courier tracking and is on sale, but the family
		// resolves to v1 until its default moves: a default outranks a newer
		// published version, which is the rule this family is here to show.
		Name: "Standard",
		Slug: "standard",
		Type: licenseschema.Development,
		Versions: []licenseVersionDef{
			{
				Description:    "Growing restaurants with delivery operations.",
				LifecycleState: licenseschema.Published,
				IsDefault:      true,
				Grants: map[string]entitlementGrant{
					"delivery-tracking": {Value: map[string]any{"type": "boolean", "value": false}},
				},
			},
			{
				Description:    "Growing restaurants with delivery operations, now including courier tracking.",
				LifecycleState: licenseschema.Published,
			},
		},
	},
	{
		// The lifecycle case, and the one the family endpoints were built for:
		// an old version withdrawn from sale, the version customers actually
		// buy, and a newer one still being prepared. Resolving this family has
		// to answer v2 -- not v3, which is the newest but a draft, and not v1,
		// which stays addressable by its own slug but is no longer on sale.
		Name: "Premium",
		Slug: "premium",
		Type: licenseschema.Paid,
		Versions: []licenseVersionDef{
			{
				Description:    "Multi-location restaurant groups with delivery fleets of up to five drivers.",
				LifecycleState: licenseschema.Archived,
				Grants: map[string]entitlementGrant{
					"delivery-drivers": {Value: map[string]any{"type": "number", "value": int32(5)}, LimitCapExceededOveragePercent: ptr.To(int32(20))},
				},
			},
			{
				Description:    "Multi-location restaurant groups with larger delivery fleets and fleet analytics.",
				LifecycleState: licenseschema.Published,
				IsDefault:      true,
			},
			{
				Description:    "Multi-location groups with fleet analytics, and AI menu forecasting for menus twice the size.",
				LifecycleState: licenseschema.Draft,
				Grants: map[string]entitlementGrant{
					"menu-items": {Value: map[string]any{"type": "number", "value": int32(100)}, LimitCapExceededOveragePercent: ptr.To(int32(20))},
				},
			},
		},
	},
}

// entitlementGrant is one license's value for one entitlement, plus the
// per-grant overage enforcement that value carries (the same entitlement is
// a hard cap on one license and a soft cap on another -- KTN's per-grant
// enforcement model). Nil for non-numeric entitlements, where overage has no
// meaning.
type entitlementGrant struct {
	Value                          map[string]any
	LimitCapExceededOveragePercent *int32
}

// licenseEntitlementValues maps license name → entitlement slug → grant: what
// every version of the family grants, unless the version's own Grants say
// otherwise (see versionGrants).
var licenseEntitlementValues = map[string]map[string]entitlementGrant{
	"Starter": {
		"menu-items":       {Value: map[string]any{"type": "number", "value": int32(5)}, LimitCapExceededOveragePercent: ptr.To(int32(0))},
		"monthly-orders":   {Value: map[string]any{"type": "number", "value": int32(20)}, LimitCapExceededOveragePercent: ptr.To(int32(0))},
		"delivery-drivers": {Value: map[string]any{"type": "number", "value": int32(2)}, LimitCapExceededOveragePercent: ptr.To(int32(0))},
		"locations":        {Value: map[string]any{"type": "number", "value": int32(1)}, LimitCapExceededOveragePercent: ptr.To(int32(0))},
		"delivery-tracking": {
			Value: map[string]any{"type": "boolean", "value": false},
		},
		"support-tier": {
			Value: map[string]any{"type": "object", "value": map[string]any{
				"tier": "community", "channels": []string{"community-forum"}, "response_sla_hours": nil,
			}},
		},
	},
	"Standard": {
		"menu-items":       {Value: map[string]any{"type": "number", "value": int32(10)}, LimitCapExceededOveragePercent: ptr.To(int32(10))},
		"monthly-orders":   {Value: map[string]any{"type": "number", "value": int32(100)}, LimitCapExceededOveragePercent: ptr.To(int32(10))},
		"delivery-drivers": {Value: map[string]any{"type": "number", "value": int32(5)}, LimitCapExceededOveragePercent: ptr.To(int32(10))},
		"locations":        {Value: map[string]any{"type": "number", "value": int32(3)}, LimitCapExceededOveragePercent: ptr.To(int32(10))},
		"delivery-tracking": {
			Value: map[string]any{"type": "boolean", "value": true},
		},
		"support-tier": {
			Value: map[string]any{"type": "object", "value": map[string]any{
				"tier": "standard", "channels": []string{"email"}, "response_sla_hours": 48,
			}},
		},
	},
	"Premium": {
		"menu-items":       {Value: map[string]any{"type": "number", "value": int32(50)}, LimitCapExceededOveragePercent: ptr.To(int32(20))},
		"monthly-orders":   {Value: map[string]any{"type": "number", "value": int32(1000)}, LimitCapExceededOveragePercent: ptr.To(int32(20))},
		"delivery-drivers": {Value: map[string]any{"type": "number", "value": int32(10)}, LimitCapExceededOveragePercent: ptr.To(int32(20))},
		"locations": {
			Value:                          map[string]any{"type": "number", "value": entitlementvalue.UnlimitedThreshold},
			LimitCapExceededOveragePercent: ptr.To(entitlementvalue.UnlimitedOveragePercent),
		},
		"delivery-tracking": {
			Value: map[string]any{"type": "boolean", "value": true},
		},
		"support-tier": {
			Value: map[string]any{"type": "object", "value": map[string]any{
				"tier": "priority", "channels": []string{"email", "slack"}, "response_sla_hours": 4,
			}},
		},
	},
}

// versionGrants is what the version at index vi of lic grants: the family's
// grants, with that version's overrides on top.
func versionGrants(lic licenseDef, vi int) map[string]entitlementGrant {
	grants := maps.Clone(licenseEntitlementValues[lic.Name])
	if grants == nil {
		grants = make(map[string]entitlementGrant, len(lic.Versions[vi].Grants))
	}
	maps.Copy(grants, lic.Versions[vi].Grants)
	return grants
}

// ── Customers & Instances ──────────────────────────────────────────────────

type usageEntry struct {
	Value      int32
	EventCount int32
}

type instanceDef struct {
	Slug        string
	NameSuffix  string
	Description string
	LicenseName string
	// LicenseVersion pins the instance to that version of LicenseName,
	// counting from 1. Zero, the usual case, pins it to the version the family
	// resolves to, which is what a vendor assigns a new customer. A version
	// the dataset archives can be named: it is withdrawn after its instances
	// are created, which is the only way an instance ends up on one.
	LicenseVersion int
	Environment    string
	ZoneKey        string
	// Status is the seeded operational status. An empty value
	// defaults to HEALTHY.
	Status instanceschema.InstanceStatus
	// LifecycleStage isn't part of the source dataset's schema, so
	// it stays unset (NULL) for every sushi-shop instance.
	LifecycleStage *string
	// CreatedAt backdates the instance to the source dataset's timeline (see
	// relativeToNow) when the dataset gives it an explicit creation event.
	// Zero value means "created now" -- the dataset doesn't date every
	// instance.
	CreatedAt time.Time
	// UsageValues maps entitlement slug → usage value/event-count for this
	// instance. Only NUMBER-type entitlements need usage values.
	UsageValues map[string]usageEntry
}

type customerDef struct {
	Name               string
	Slug               string
	ExternalCustomerID *string
	Instances          []instanceDef
}

var customers = []customerDef{
	{
		Name:               "Sakura Tokyo",
		Slug:               "sakura-tokyo",
		ExternalCustomerID: ptr.To("crm-1024"),
		Instances: []instanceDef{
			{
				Slug: "sakura-tokyo-prod", NameSuffix: "Production",
				Description: "Production environment for the Sakura Tokyo restaurant group.",
				LicenseName: "Premium", Environment: "production", ZoneKey: zoneKeySakuraDedicated,
				Status:    instanceschema.InstanceStatusHealthy,
				CreatedAt: time.Date(2026, 7, 2, 9, 0, 0, 0, time.UTC),
				UsageValues: map[string]usageEntry{
					"menu-items":       {Value: 42, EventCount: 12},
					"monthly-orders":   {Value: 730, EventCount: 730},
					"delivery-drivers": {Value: 8, EventCount: 5},
					"locations":        {Value: 3, EventCount: 3},
				},
			},
			{
				Slug: "sakura-tokyo-demo", NameSuffix: "Demo",
				Description: "Sales demo environment for the Sakura Tokyo group — same customer, a smaller license.",
				LicenseName: "Starter", Environment: "demo", ZoneKey: zoneKeySharedAPAC,
				Status:    instanceschema.InstanceStatusMaintenance,
				CreatedAt: time.Date(2026, 7, 2, 9, 20, 0, 0, time.UTC),
				UsageValues: map[string]usageEntry{
					"menu-items":       {Value: 3, EventCount: 3},
					"monthly-orders":   {Value: 7, EventCount: 7},
					"delivery-drivers": {Value: 1, EventCount: 1},
					"locations":        {Value: 1, EventCount: 1},
				},
			},
		},
	},
	{
		Name:               "Ninja Osaka",
		Slug:               "ninja-osaka",
		ExternalCustomerID: ptr.To("crm-2048"),
		Instances: []instanceDef{
			{
				Slug: "ninja-osaka-prod", NameSuffix: "Production",
				Description: "Production environment for Ninja Osaka.",
				LicenseName: "Starter", Environment: "production", ZoneKey: zoneKeySharedAPAC,
				Status:    instanceschema.InstanceStatusHealthy,
				CreatedAt: time.Date(2026, 7, 2, 9, 10, 0, 0, time.UTC),
				UsageValues: map[string]usageEntry{
					"menu-items":       {Value: 5, EventCount: 4},
					"monthly-orders":   {Value: 18, EventCount: 18},
					"delivery-drivers": {Value: 1, EventCount: 1},
					"locations":        {Value: 1, EventCount: 1},
				},
			},
			{
				// On a version newer than the one its family serves: Standard
				// still puts v1 forward, and this pilot runs v2 for its courier
				// tracking. Created after the production instance, which stays
				// the customer's primary one for flag targeting.
				Slug: "ninja-osaka-delivery", NameSuffix: "Delivery Pilot",
				Description: "Ninja Osaka's delivery pilot, on Standard v2 for its courier tracking.",
				LicenseName: "Standard", LicenseVersion: 2, Environment: "staging", ZoneKey: zoneKeySharedAPAC,
				Status:    instanceschema.InstanceStatusHealthy,
				CreatedAt: time.Date(2026, 8, 18, 10, 0, 0, 0, time.UTC),
				UsageValues: map[string]usageEntry{
					"menu-items":       {Value: 4, EventCount: 4},
					"monthly-orders":   {Value: 26, EventCount: 26},
					"delivery-drivers": {Value: 3, EventCount: 3},
					"locations":        {Value: 1, EventCount: 1},
				},
			},
		},
	},
	{
		Name:               "Demo Restaurant",
		Slug:               "demo-restaurant",
		ExternalCustomerID: nil,
		Instances: []instanceDef{
			{
				Slug: "demo-restaurant-prod", NameSuffix: "Production",
				Description: "Sandbox environment used for demos and testing.",
				LicenseName: "Standard", Environment: "demo", ZoneKey: zoneKeySharedEU,
				Status: instanceschema.InstanceStatusHealthy,
				// The dataset gives no instance.created audit event for this
				// one, so it isn't backdated (CreatedAt left zero).
				UsageValues: map[string]usageEntry{
					"menu-items":       {Value: 6, EventCount: 3},
					"monthly-orders":   {Value: 41, EventCount: 41},
					"delivery-drivers": {Value: 2, EventCount: 2},
					"locations":        {Value: 2, EventCount: 2},
				},
			},
		},
	},
	{
		// An early Premium customer, still on the first version: v1 was
		// withdrawn from sale after this instance bought it, and an instance
		// keeps its version when that happens. Its fleet is at
		// v1's five-driver cap, the reason to move to v2.
		Name:               "Kappa Kyoto",
		Slug:               "kappa-kyoto",
		ExternalCustomerID: ptr.To("crm-4096"),
		Instances: []instanceDef{
			{
				Slug: "kappa-kyoto-prod", NameSuffix: "Production",
				Description: "Production environment for Kappa Kyoto, still on the first version of Premium.",
				LicenseName: "Premium", LicenseVersion: 1, Environment: "production", ZoneKey: zoneKeySharedAPAC,
				Status:    instanceschema.InstanceStatusHealthy,
				CreatedAt: time.Date(2026, 5, 12, 9, 0, 0, 0, time.UTC),
				UsageValues: map[string]usageEntry{
					"menu-items":       {Value: 31, EventCount: 9},
					"monthly-orders":   {Value: 412, EventCount: 412},
					"delivery-drivers": {Value: 5, EventCount: 5},
					"locations":        {Value: 2, EventCount: 2},
				},
			},
		},
	},
}

// usageEntitlementOrder defines the deterministic iteration order for usage
// values, avoiding map iteration non-determinism.
var usageEntitlementOrder = []string{"menu-items", "monthly-orders", "delivery-drivers", "locations"}

// ── Deployment Zones ───────────────────────────────────────────────────────

// deploymentZoneDef.Type is the zone's environment class -- production,
// staging or development, the ones the console labels and feature-flag rules
// match on. Whether a zone is shared or dedicated to one customer is not an
// environment, so it is the `dedicated` metadata field instead.
type deploymentZoneDef struct {
	Key               string
	Name              string
	Type              string
	Description       string
	Region            string
	ComplianceProfile string
	Dedicated         bool
}

func (d deploymentZoneDef) MetadataPayload() map[string]any {
	return map[string]any{
		"region":             d.Region,
		"compliance_profile": d.ComplianceProfile,
		"dedicated":          d.Dedicated,
	}
}

var deploymentZones = []deploymentZoneDef{
	{
		Key:               zoneKeySharedAPAC,
		Name:              "Shared APAC",
		Type:              "production",
		Description:       "Multi-tenant zone for APAC restaurants.",
		Region:            "ap-northeast-1",
		ComplianceProfile: "standard",
	},
	{
		Key:               zoneKeySharedEU,
		Name:              "Shared EU",
		Type:              "production",
		Description:       "Multi-tenant zone for European restaurants.",
		Region:            "eu-west-1",
		ComplianceProfile: "standard",
	},
	{
		Key:               zoneKeySakuraDedicated,
		Name:              "Sakura Dedicated",
		Type:              "production",
		Description:       "Dedicated zone for the Sakura Tokyo group.",
		Region:            "ap-northeast-1",
		ComplianceProfile: "pci-dss",
		Dedicated:         true,
	},
}

// deploymentDef is one entry in the deployment journal: one release rolled
// out to one zone. The first entry per zone (in slice order) is applied at
// zone-creation time; later ones for the same zone are replayed through
// UpdateDeploymentZone, the same path a real rollout takes.
type deploymentDef struct {
	ZoneKey        string
	ReleaseVersion string
	CreatedAt      time.Time
}

// deployments tells the progressive-rollout story: 2026.8.0 (delivery
// tracking) reaches both shared zones; the dedicated Sakura zone stays on
// 2026.7.0 -- its journal shows the pending upgrade.
var deployments = []deploymentDef{
	{ZoneKey: zoneKeySharedEU, ReleaseVersion: "2026.7.0", CreatedAt: time.Date(2026, 7, 5, 9, 0, 0, 0, time.UTC)},
	{ZoneKey: zoneKeySharedAPAC, ReleaseVersion: "2026.7.0", CreatedAt: time.Date(2026, 7, 5, 9, 30, 0, 0, time.UTC)},
	{ZoneKey: zoneKeySakuraDedicated, ReleaseVersion: "2026.7.0", CreatedAt: time.Date(2026, 7, 8, 8, 0, 0, 0, time.UTC)},
	{ZoneKey: zoneKeySharedEU, ReleaseVersion: "2026.8.0", CreatedAt: time.Date(2026, 8, 12, 9, 0, 0, 0, time.UTC)},
	{ZoneKey: zoneKeySharedAPAC, ReleaseVersion: "2026.8.0", CreatedAt: time.Date(2026, 8, 13, 9, 0, 0, 0, time.UTC)},
}

// ── Releases & Components ─────────────────────────────────────────────────

type releaseComponentPatchOp string

const (
	opAdd    releaseComponentPatchOp = "add"
	opRemove releaseComponentPatchOp = "remove"
)

// componentPatch changes what a release ships relative to its previous
// release: an add creates a component and bundles it, a remove takes out one
// the release inherited.
//
// PreviousSlug, on an add, names the component the new one is the next version
// of. It is created as that component's successor (previous_component_id),
// which is how the catalogue shows a component's version chain. It does not
// take the older version out of the release -- a remove patch does -- so a
// release that upgrades a component carries both patches.
type componentPatch struct {
	Op           releaseComponentPatchOp
	Name         *string
	Version      *string
	Slug         *string
	Description  *string
	PreviousSlug *string
	RemoveSlug   *string
}

// releaseDef.Slug is fixed rather than generated, for the reason licenseDef's
// is: a release created without one gets its version plus six random
// characters, so every seed would give the same release a new address and
// nothing could link to one.
type releaseDef struct {
	Slug            string
	Version         string
	Description     string
	PreviousVersion string
	Patches         []componentPatch
}

func addComp(name, version, slug, description string) componentPatch {
	return componentPatch{
		Op:          opAdd,
		Name:        ptr.To(name),
		Version:     ptr.To(version),
		Slug:        ptr.To(slug),
		Description: ptr.To(description),
	}
}

// nextComp adds the next version of the component slugged previousSlug.
func nextComp(previousSlug, name, version, slug, description string) componentPatch {
	patch := addComp(name, version, slug, description)
	patch.PreviousSlug = ptr.To(previousSlug)
	return patch
}

func removeComp(slug string) componentPatch {
	return componentPatch{Op: opRemove, RemoveSlug: ptr.To(slug)}
}

var releases = []releaseDef{
	{
		Slug:        "r-2026-7-0",
		Version:     "2026.7.0",
		Description: "July platform release.",
		Patches: []componentPatch{
			addComp("API", "2026.7.0", "api-2026-7-0", "Core ordering and kitchen API."),
			addComp("Web App", "2026.7.0", "web-app-2026-7-0", "Customer-facing ordering web app."),
			addComp("Kitchen Display", "1.2.0", "kitchen-display-1-2-0", "Kitchen display system."),
			addComp("Delivery Service", "0.9.0", "delivery-service-0-9-0", "Driver dispatch (beta)."),
		},
	},
	{
		// Upgrades three of July's four components and keeps Kitchen Display.
		// Each new version replaces the one it follows, so the release ships
		// four components, one version of each, as July did.
		Slug:            "r-2026-8-0",
		Version:         "2026.8.0",
		PreviousVersion: "2026.7.0",
		Description:     "Introduces real-time delivery tracking.",
		Patches: []componentPatch{
			removeComp("api-2026-7-0"),
			nextComp("api-2026-7-0", "API", "2026.8.0", "api-2026-8-0", "Adds delivery tracking endpoints."),
			removeComp("web-app-2026-7-0"),
			nextComp("web-app-2026-7-0", "Web App", "2026.8.0", "web-app-2026-8-0", "Delivery tracking UI."),
			removeComp("delivery-service-0-9-0"),
			nextComp("delivery-service-0-9-0", "Delivery Service", "1.0.0", "delivery-service-1-0-0", "GA: real-time position streaming."),
		},
	},
}

// releaseBundles is what each release ships, keyed by version, as component
// slugs: what its previous release shipped, with its own patches applied in
// order. Releases are listed oldest first, and a release whose previous one
// comes later is refused here. seedReleases bundles exactly this, and
// data_test.go reads it, so the two cannot disagree on what a release
// contains.
func releaseBundles() (map[string][]string, error) {
	bundles := make(map[string][]string, len(releases))

	for _, rel := range releases {
		var slugs []string
		if rel.PreviousVersion != "" {
			inherited, ok := bundles[rel.PreviousVersion]
			if !ok {
				return nil, fmt.Errorf("release %q references unknown previous version %q", rel.Version, rel.PreviousVersion)
			}
			slugs = slices.Clone(inherited)
		}

		for _, patch := range rel.Patches {
			switch patch.Op {
			case opAdd:
				slugs = append(slugs, *patch.Slug)
			case opRemove:
				i := slices.Index(slugs, *patch.RemoveSlug)
				if i < 0 {
					return nil, fmt.Errorf("release %q cannot remove component %q, which it does not bundle", rel.Version, *patch.RemoveSlug)
				}
				slugs = slices.Delete(slugs, i, i+1)
			default:
				return nil, fmt.Errorf("release %q has an unsupported component patch op %q", rel.Version, patch.Op)
			}
		}

		bundles[rel.Version] = slugs
	}

	return bundles, nil
}

// ── Feature Flags ──────────────────────────────────────────────────────────

var featureFlags = []schema.FeatureFlag{
	// 1. Delivery Tracking Enabled — boolean, reads the delivery-tracking
	// entitlement directly (the canonical flag-reads-entitlement chain).
	{
		Name:        "Delivery Tracking Enabled",
		Slug:        "delivery-tracking-enabled",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "delivery-tracking-enabled.evaluated",
		Description: ptr.To("Gates the real-time delivery tracking UI. Reads the delivery-tracking entitlement."),
		Variants: []schema.Variant{
			{Name: "on", Value: true, Description: "Delivery tracking is visible"},
			{Name: "off", Value: false, Description: "Delivery tracking is hidden"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Delivery tracking entitlement granted", "__kaiten.entitlements['delivery-tracking'].limit >= 1.0", "on"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("off"),
		},
	},

	// 2. Analytics Dashboard Enabled — boolean, anchored on the customer
	// (not the entitlement) so it matches every instance of that customer.
	{
		Name:        "Analytics Dashboard Enabled",
		Slug:        "analytics-dashboard-enabled",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "analytics-dashboard-enabled.evaluated",
		Description: ptr.To("Enables the analytics dashboard for high-volume customers."),
		Variants: []schema.Variant{
			{Name: "on", Value: true, Description: "Analytics dashboard is visible"},
			{Name: "off", Value: false, Description: "Analytics dashboard is hidden"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Sakura Tokyo, high order volume", "__kaiten.customer.slug == 'sakura-tokyo' && orderCount > 10", "on"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("off"),
		},
	},

	// 3. New Ordering Flow — boolean, one customer opted in.
	{
		Name:        "New Ordering Flow",
		Slug:        "new-ordering-flow",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "new-ordering-flow.evaluated",
		Description: ptr.To("Progressive rollout of the redesigned ordering flow."),
		Variants: []schema.Variant{
			{Name: "on", Value: true, Description: "Redesigned ordering flow"},
			{Name: "off", Value: false, Description: "Legacy ordering flow"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Demo Restaurant", "__kaiten.customer.slug == 'demo-restaurant'", "on"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("off"),
		},
	},

	// 4. Random Discount — boolean, 50/50 experiment.
	{
		Name:        "Random Discount",
		Slug:        "random-discount",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "random-discount.evaluated",
		Description: ptr.To("50/50 experiment applying a surprise discount at checkout."),
		Variants: []schema.Variant{
			{Name: "on", Value: true, Description: "Surprise discount applied"},
			{Name: "off", Value: false, Description: "No surprise discount"},
		},
		Targetings: schema.Targetings{
			schema.NewRolloutPercentageTargeting("50/50 rollout", "true", map[string]int64{"on": 50, "off": 50}),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("off"),
		},
	},

	// 5. Promo Banner — object, style differs for paying plans.
	{
		Name:        "Promo Banner",
		Slug:        "promo-banner",
		Type:        "object",
		Enabled:     true,
		EventName:   "promo-banner.evaluated",
		Description: ptr.To("Controls the in-app promotional banner style and message."),
		Variants: []schema.Variant{
			{
				Name:        "control",
				Description: "Default welcome banner",
				Value:       map[string]any{"bannerText": "Welcome to Kaiten Sushi", "bannerColor": "#070708"},
			},
			{
				Name:        "salmon-week",
				Description: "Salmon week promotional banner",
				Value:       map[string]any{"bannerText": "Fresh salmon week — new arrivals daily", "bannerColor": "#C91D21"},
			},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Standard or Premium license", "__kaiten.license.familySlug in ['standard', 'premium']", "salmon-week"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("control"),
		},
	},

	// 6. Discount Campaign — object, seasonal campaign for Premium.
	{
		Name:        "Discount Campaign",
		Slug:        "discount-campaign",
		Type:        "object",
		Enabled:     true,
		EventName:   "discount-campaign.evaluated",
		Description: ptr.To("Seasonal discount configuration: percentage, label, end date."),
		Variants: []schema.Variant{
			{
				Name:        "none",
				Description: "No active campaign",
				Value:       map[string]any{"percentage": 0, "label": "", "endsAt": nil},
			},
			{
				Name:        "autumn-10",
				Description: "Autumn 10% discount",
				Value:       map[string]any{"percentage": 10, "label": "Autumn special", "endsAt": "2026-10-31T23:59:59Z"},
			},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Premium license", "__kaiten.license.familySlug == 'premium'", "autumn-10"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("none"),
		},
	},

	// 7. Loyalty Offer — object, reward for returning customers.
	{
		Name:        "Loyalty Offer",
		Slug:        "loyalty-offer",
		Type:        "object",
		Enabled:     true,
		EventName:   "loyalty-offer.evaluated",
		Description: ptr.To("Loyalty reward configuration for returning customers."),
		Variants: []schema.Variant{
			{
				Name:        "none",
				Description: "No loyalty reward yet",
				Value:       map[string]any{"reward": nil, "threshold": nil},
			},
			{
				Name:        "free-maki",
				Description: "Free maki roll after 10 orders",
				Value:       map[string]any{"reward": "free-maki-roll", "threshold": 10},
			},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("10+ orders", "orderCount >= 10", "free-maki"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("none"),
		},
	},
}

// ── Audit Trail ────────────────────────────────────────────────────────────
//
// The source dataset ships its own audit_trail array with event_name/type
// guesses the dataset itself flags as unverified. Checked against
// the real events.Catalogue() (each module's events package): several were
// wrong (e.g. it uses "com.kaiten.license.v1.entitlement_updated" for a
// first-time association; the real event is LicenseEntitlementAssigned /
// "com.kaiten.license.entitlement.v1.assigned"). The Name/Type pairs below
// are the corrected real values. The dataset's own event_type field
// ("change"/"evaluation"/"usage") also isn't a real column value -- the real
// audit_trail.event_type column holds the CloudEvents dotted type string
// (see internal/modules/audittrail/subscriber and internal/infrastructure/outbox).
//
// The events that reach the notification bell carry the payload their real
// producer writes, because the bell renders from it: the instance payload, the
// deployment record, the license entitlement, the entitlement usage. The others
// keep the dataset's annotated shapes -- their "note"s are what the audit trail
// page is there to show.
type auditEvent struct {
	OccurredAt   time.Time
	InstanceSlug string // "" means an org-level event, no instance
	Name         string
	Type         string
	Payload      map[string]any
}

// seedRef stands in a payload for a value that only exists once the steps
// before the audit trail have run -- an id, or a slug the API generated.
// seedAuditTrail swaps each one for the real value, so a payload can name
// objects the way its producer does: RELEASE_DEPLOYED, for one, carries
// nothing but ids.
type seedRef struct {
	kind seedRefKind
	key  string
}

type seedRefKind int

const (
	refInstanceID seedRefKind = iota
	refZoneID
	refReleaseID
	refLicenseID
	refLicenseSlug
	refEntitlementID
)

// The key each ref takes is the one the data above is written in: an instance
// slug, a zone key, a release version, a license name, an entitlement slug.
func instanceID(slug string) seedRef   { return seedRef{kind: refInstanceID, key: slug} }
func zoneID(key string) seedRef        { return seedRef{kind: refZoneID, key: key} }
func releaseID(version string) seedRef { return seedRef{kind: refReleaseID, key: version} }
func licenseID(name string) seedRef    { return seedRef{kind: refLicenseID, key: name} }
func licenseSlug(name string) seedRef  { return seedRef{kind: refLicenseSlug, key: name} }
func entitlementID(slug string) seedRef {
	return seedRef{kind: refEntitlementID, key: slug}
}

var auditTrail = []auditEvent{
	{
		OccurredAt: time.Date(2026, 7, 1, 10, 0, 0, 0, time.UTC),
		Name:       entitlementevents.EntitlementCreated.Name,
		Type:       entitlementevents.EntitlementCreated.Type,
		Payload:    map[string]any{"entitlement": "delivery-tracking", "type": "BOOLEAN"},
	},
	{
		OccurredAt: time.Date(2026, 7, 1, 10, 5, 0, 0, time.UTC),
		Name:       licenseevents.LicenseEntitlementAssigned.Name,
		Type:       licenseevents.LicenseEntitlementAssigned.Type,
		Payload: map[string]any{
			"licenseId":       licenseID("Premium"),
			"licenseSlug":     licenseSlug("Premium"),
			"entitlementName": "Delivery Tracking",
			"entitlementSlug": "delivery-tracking",
			"entitlementType": "BOOLEAN",
			"value":           map[string]any{"type": "boolean", "value": true},
		},
	},
	{
		OccurredAt: time.Date(2026, 7, 1, 10, 6, 0, 0, time.UTC),
		Name:       licenseevents.LicenseEntitlementAssigned.Name,
		Type:       licenseevents.LicenseEntitlementAssigned.Type,
		Payload: map[string]any{
			"licenseId":       licenseID("Starter"),
			"licenseSlug":     licenseSlug("Starter"),
			"entitlementName": "Delivery Tracking",
			"entitlementSlug": "delivery-tracking",
			"entitlementType": "BOOLEAN",
			"value":           map[string]any{"type": "boolean", "value": false},
		},
	},
	{
		OccurredAt:   time.Date(2026, 7, 2, 9, 0, 0, 0, time.UTC),
		InstanceSlug: "sakura-tokyo-prod",
		Name:         instanceevents.InstanceCreated.Name,
		Type:         instanceevents.InstanceCreated.Type,
		Payload: map[string]any{
			"id":                 instanceID("sakura-tokyo-prod"),
			"slug":               "sakura-tokyo-prod",
			"name":               "Sakura Tokyo Production",
			"customerSlug":       "sakura-tokyo",
			"deploymentZoneId":   zoneID(zoneKeySakuraDedicated),
			"deploymentZoneSlug": zoneKeySakuraDedicated,
			"licenseId":          licenseID("Premium"),
			"licenseSlug":        licenseSlug("Premium"),
		},
	},
	{
		OccurredAt:   time.Date(2026, 7, 2, 9, 10, 0, 0, time.UTC),
		InstanceSlug: "ninja-osaka-prod",
		Name:         instanceevents.InstanceCreated.Name,
		Type:         instanceevents.InstanceCreated.Type,
		Payload: map[string]any{
			"id":                 instanceID("ninja-osaka-prod"),
			"slug":               "ninja-osaka-prod",
			"name":               "Ninja Osaka Production",
			"customerSlug":       "ninja-osaka",
			"deploymentZoneId":   zoneID(zoneKeySharedAPAC),
			"deploymentZoneSlug": zoneKeySharedAPAC,
			"licenseId":          licenseID("Starter"),
			"licenseSlug":        licenseSlug("Starter"),
		},
	},
	{
		OccurredAt:   time.Date(2026, 7, 2, 9, 20, 0, 0, time.UTC),
		InstanceSlug: "sakura-tokyo-demo",
		Name:         instanceevents.InstanceCreated.Name,
		Type:         instanceevents.InstanceCreated.Type,
		Payload: map[string]any{
			"id":                 instanceID("sakura-tokyo-demo"),
			"slug":               "sakura-tokyo-demo",
			"name":               "Sakura Tokyo Demo",
			"customerSlug":       "sakura-tokyo",
			"deploymentZoneId":   zoneID(zoneKeySharedAPAC),
			"deploymentZoneSlug": zoneKeySharedAPAC,
			"licenseId":          licenseID("Starter"),
			"licenseSlug":        licenseSlug("Starter"),
		},
	},
	{
		OccurredAt: time.Date(2026, 7, 3, 14, 0, 0, 0, time.UTC),
		Name:       featureflagevents.FeatureFlagUpdated.Name,
		Type:       featureflagevents.FeatureFlagUpdated.Type,
		Payload:    map[string]any{"flag": "delivery-tracking-enabled", "change": "targeting_rules", "rule": "__kaiten.entitlements['delivery-tracking'].limit >= 1.0"},
	},
	{
		OccurredAt: time.Date(2026, 8, 12, 9, 0, 5, 0, time.UTC),
		Name:       deploymentzoneevents.ReleaseDeployed.Name,
		Type:       deploymentzoneevents.ReleaseDeployed.Type,
		Payload: map[string]any{
			"deploymentZoneId": zoneID(zoneKeySharedEU),
			"releaseId":        releaseID("2026.8.0"),
		},
	},
	{
		OccurredAt:   time.Date(2026, 8, 14, 11, 2, 11, 0, time.UTC),
		InstanceSlug: "sakura-tokyo-prod",
		Name:         featureflagevents.FeatureFlagEvaluated.Name,
		Type:         featureflagevents.FeatureFlagEvaluated.Type,
		Payload:      map[string]any{"flag": "delivery-tracking-enabled", "variant": "on", "value": true, "reason": "TARGETING_MATCH", "matched_rule": "__kaiten.entitlements['delivery-tracking'].limit >= 1.0"},
	},
	{
		OccurredAt:   time.Date(2026, 8, 14, 11, 2, 12, 0, time.UTC),
		InstanceSlug: "ninja-osaka-prod",
		Name:         featureflagevents.FeatureFlagEvaluated.Name,
		Type:         featureflagevents.FeatureFlagEvaluated.Type,
		Payload:      map[string]any{"flag": "delivery-tracking-enabled", "variant": "off", "value": false, "reason": "DEFAULT"},
	},
	{
		OccurredAt:   time.Date(2026, 8, 14, 11, 2, 13, 0, time.UTC),
		InstanceSlug: "sakura-tokyo-demo",
		Name:         featureflagevents.FeatureFlagEvaluated.Name,
		Type:         featureflagevents.FeatureFlagEvaluated.Type,
		Payload:      map[string]any{"flag": "delivery-tracking-enabled", "variant": "off", "value": false, "reason": "DEFAULT", "note": "same customer as sakura-tokyo-prod, different license — the entitlement rule does not match"},
	},
	{
		OccurredAt:   time.Date(2026, 8, 14, 11, 5, 40, 0, time.UTC),
		InstanceSlug: "sakura-tokyo-prod",
		Name:         featureflagevents.FeatureFlagEvaluated.Name,
		Type:         featureflagevents.FeatureFlagEvaluated.Type,
		Payload:      map[string]any{"flag": "analytics-dashboard-enabled", "variant": "on", "value": true, "reason": "TARGETING_MATCH", "context": map[string]any{"orderCount": 14}},
	},
	{
		OccurredAt:   time.Date(2026, 8, 14, 11, 5, 41, 0, time.UTC),
		InstanceSlug: "sakura-tokyo-demo",
		Name:         featureflagevents.FeatureFlagEvaluated.Name,
		Type:         featureflagevents.FeatureFlagEvaluated.Type,
		Payload:      map[string]any{"flag": "analytics-dashboard-enabled", "variant": "on", "value": true, "reason": "TARGETING_MATCH", "context": map[string]any{"orderCount": 11}, "note": "customer-anchored rule — matches both Sakura instances"},
	},
	{
		OccurredAt:   time.Date(2026, 8, 15, 16, 20, 0, 0, time.UTC),
		InstanceSlug: "ninja-osaka-prod",
		Name:         instanceevents.EntitlementUsageReportAccepted.Name,
		Type:         instanceevents.EntitlementUsageReportAccepted.Type,
		Payload:      map[string]any{"entitlement": "menu-items", "value": 5, "limit": 5, "note": "at limit"},
	},
	{
		OccurredAt:   time.Date(2026, 8, 15, 16, 20, 1, 0, time.UTC),
		InstanceSlug: "ninja-osaka-prod",
		Name:         instanceevents.InstanceEntitlementUsageReached.Name,
		Type:         instanceevents.InstanceEntitlementUsageReached.Type,
		Payload: map[string]any{
			"entitlementId":   entitlementID("menu-items"),
			"entitlementSlug": "menu-items",
			"licenseId":       licenseID("Starter"),
			"licenseSlug":     licenseSlug("Starter"),
			"value":           map[string]any{"type": "number", "value": 5},
			"limit":           map[string]any{"type": "number", "value": 5},
		},
	},
}
