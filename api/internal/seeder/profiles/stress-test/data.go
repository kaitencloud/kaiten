package stresstest

import (
	"time"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// LicenseDef defines a license to create.
type LicenseDef struct {
	Name        string
	Description string
	Type        licenseschema.Type
	IsDefault   bool
}

// LicenseEntitlementDef defines a license-entitlement association.
type LicenseEntitlementDef struct {
	LicenseName     string
	EntitlementSlug string
	Threshold       int32
}

const (
	zoneKeyProductionEU = "production-eu"
	zoneKeyProductionUS = "production-us"
	zoneKeyStagingEU    = "staging-eu"
	zoneKeyStagingUS    = "staging-us"
	zoneKeySandbox      = "sandbox"
	zoneKeyDevelopment  = "development"
)

// DeploymentZoneDef defines a deployment zone to create.
type DeploymentZoneDef struct {
	Key                   string
	Name                  string
	Type                  string
	Description           string
	Region                string
	Cluster               string
	FeatureToggles        []string
	CurrentReleaseVersion string
}

func (d DeploymentZoneDef) MetadataPayload() map[string]interface{} {
	return map[string]interface{}{
		"region":         d.Region,
		"cluster":        d.Cluster,
		"featureToggles": append([]string{}, d.FeatureToggles...),
	}
}

// ReleaseDef defines a release to create.
type ReleaseDef struct {
	Version          string
	Description      string
	PreviousVersion  string
	ComponentPatches []ReleaseComponentPatch
}

type ReleaseComponentPatchOperation string

const (
	releaseComponentPatchAdd    ReleaseComponentPatchOperation = "add"
	releaseComponentPatchRemove ReleaseComponentPatchOperation = "remove"
)

type ReleaseComponentPatch struct {
	Op            ReleaseComponentPatchOperation
	Name          *string
	Version       *string
	Slug          *string
	Description   *string
	ComponentSlug *string
}

func addComponent(name string, version string, slug string, description string) ReleaseComponentPatch {
	return ReleaseComponentPatch{
		Op:          releaseComponentPatchAdd,
		Name:        ptr.To(name),
		Version:     ptr.To(version),
		Slug:        ptr.To(slug),
		Description: ptr.To(description),
	}
}

func removeComponent(slug string) ReleaseComponentPatch {
	return ReleaseComponentPatch{
		Op:            releaseComponentPatchRemove,
		ComponentSlug: ptr.To(slug),
	}
}

// dev is a shorthand for the shared TMNT dev identities.
var dev = &seedkit.DevData

// Entitlements (from seed.sql)
var entitlementGroups = []seedkit.EntitlementGroupDef{
	{Name: "Advanced Capabilities", Slug: "advanced-capabilities"},
	{Name: "Data Governance", Slug: "data-governance"},
	{Name: "Security & Access", Slug: "security-access"},
	{Name: "Support & Operations", Slug: "support-operations"},
	{Name: "Usage & Quotas", Slug: "usage-quotas"},
}

var entitlements = []seedkit.EntitlementDef{
	{
		Name:              "Seats",
		Slug:              "seats",
		Description:       "Maximum number of seats",
		GroupSlugs:        []string{"usage-quotas"},
		Type:              entitlementschema.Number,
		AggregationMethod: entitlementschema.Max,
	},
	{
		Name:              "API calls",
		Slug:              "api-calls",
		Description:       "API calls per month",
		GroupSlugs:        []string{"usage-quotas"},
		Type:              entitlementschema.Number,
		AggregationMethod: entitlementschema.Sum,
	},
	{
		Name:              "Projects",
		Slug:              "projects",
		Description:       "Projects created",
		GroupSlugs:        []string{"usage-quotas"},
		Type:              entitlementschema.Number,
		AggregationMethod: entitlementschema.Count,
	},
	{
		Name:              "AI features",
		Slug:              "ai-features",
		Description:       "Access to AI-powered features",
		GroupSlugs:        []string{"advanced-capabilities"},
		Type:              entitlementschema.Boolean,
		AggregationMethod: entitlementschema.Max,
	},
	{
		Name:              "Environments",
		Slug:              "environments",
		Description:       "Maximum number of active environments",
		GroupSlugs:        []string{"usage-quotas"},
		Type:              entitlementschema.Number,
		AggregationMethod: entitlementschema.Max,
	},
	{
		Name:              "Storage (GB)",
		Slug:              "storage-gb",
		Description:       "Allocated storage in gigabytes",
		GroupSlugs:        []string{"usage-quotas"},
		Type:              entitlementschema.Number,
		AggregationMethod: entitlementschema.Max,
	},
	{
		Name:              "SSO",
		Slug:              "sso",
		Description:       "Access to SSO integrations",
		GroupSlugs:        []string{"security-access"},
		Type:              entitlementschema.Boolean,
		AggregationMethod: entitlementschema.Max,
	},
	{
		Name:              "Support tickets",
		Slug:              "support-tickets",
		Description:       "Support tickets handled per month",
		GroupSlugs:        []string{"support-operations"},
		Type:              entitlementschema.Number,
		AggregationMethod: entitlementschema.Sum,
	},
	{
		Name:              "Audit retention (days)",
		Slug:              "audit-retention-days",
		Description:       "Audit log retention period in days",
		GroupSlugs:        []string{"data-governance", "security-access"},
		Type:              entitlementschema.Number,
		AggregationMethod: entitlementschema.Max,
	},
}

// Licenses (from seed.sql)
var licenses = []LicenseDef{
	{Name: "Community", Description: "Community tier", Type: licenseschema.Community, IsDefault: true},
	{Name: "Starter", Description: "Starter trial tier", Type: licenseschema.Trial, IsDefault: false},
	{Name: "Dev", Description: "Developer tier", Type: licenseschema.Development, IsDefault: false},
	{Name: "Pro", Description: "Paid tier Pro", Type: licenseschema.Paid, IsDefault: false},
	{Name: "Enterprise", Description: "Enterprise tier", Type: licenseschema.Paid, IsDefault: false},
}

// License-entitlement associations (from seed.sql thresholds)
var licenseEntitlements = []LicenseEntitlementDef{
	// Community
	{LicenseName: "Community", EntitlementSlug: "seats", Threshold: 1},
	{LicenseName: "Community", EntitlementSlug: "api-calls", Threshold: 1000},
	{LicenseName: "Community", EntitlementSlug: "projects", Threshold: 3},
	{LicenseName: "Community", EntitlementSlug: "ai-features", Threshold: 0},
	{LicenseName: "Community", EntitlementSlug: "environments", Threshold: 1},
	{LicenseName: "Community", EntitlementSlug: "storage-gb", Threshold: 5},
	{LicenseName: "Community", EntitlementSlug: "sso", Threshold: 0},
	{LicenseName: "Community", EntitlementSlug: "support-tickets", Threshold: 2},
	{LicenseName: "Community", EntitlementSlug: "audit-retention-days", Threshold: 7},
	// Starter
	{LicenseName: "Starter", EntitlementSlug: "seats", Threshold: 3},
	{LicenseName: "Starter", EntitlementSlug: "api-calls", Threshold: 10000},
	{LicenseName: "Starter", EntitlementSlug: "projects", Threshold: 10},
	{LicenseName: "Starter", EntitlementSlug: "ai-features", Threshold: 1},
	{LicenseName: "Starter", EntitlementSlug: "environments", Threshold: 2},
	{LicenseName: "Starter", EntitlementSlug: "storage-gb", Threshold: 25},
	{LicenseName: "Starter", EntitlementSlug: "sso", Threshold: 0},
	{LicenseName: "Starter", EntitlementSlug: "support-tickets", Threshold: 10},
	{LicenseName: "Starter", EntitlementSlug: "audit-retention-days", Threshold: 30},
	// Dev
	{LicenseName: "Dev", EntitlementSlug: "seats", Threshold: 10},
	{LicenseName: "Dev", EntitlementSlug: "api-calls", Threshold: 100000},
	{LicenseName: "Dev", EntitlementSlug: "projects", Threshold: 40},
	{LicenseName: "Dev", EntitlementSlug: "ai-features", Threshold: 1},
	{LicenseName: "Dev", EntitlementSlug: "environments", Threshold: 5},
	{LicenseName: "Dev", EntitlementSlug: "storage-gb", Threshold: 100},
	{LicenseName: "Dev", EntitlementSlug: "sso", Threshold: 1},
	{LicenseName: "Dev", EntitlementSlug: "support-tickets", Threshold: 40},
	{LicenseName: "Dev", EntitlementSlug: "audit-retention-days", Threshold: 90},
	// Pro
	{LicenseName: "Pro", EntitlementSlug: "seats", Threshold: 100},
	{LicenseName: "Pro", EntitlementSlug: "api-calls", Threshold: 1000000},
	{LicenseName: "Pro", EntitlementSlug: "projects", Threshold: 200},
	{LicenseName: "Pro", EntitlementSlug: "ai-features", Threshold: 1},
	{LicenseName: "Pro", EntitlementSlug: "environments", Threshold: 20},
	{LicenseName: "Pro", EntitlementSlug: "storage-gb", Threshold: 500},
	{LicenseName: "Pro", EntitlementSlug: "sso", Threshold: 1},
	{LicenseName: "Pro", EntitlementSlug: "support-tickets", Threshold: 120},
	{LicenseName: "Pro", EntitlementSlug: "audit-retention-days", Threshold: 365},
	// Enterprise
	{LicenseName: "Enterprise", EntitlementSlug: "seats", Threshold: 500},
	{LicenseName: "Enterprise", EntitlementSlug: "api-calls", Threshold: -1},
	{LicenseName: "Enterprise", EntitlementSlug: "projects", Threshold: -1},
	{LicenseName: "Enterprise", EntitlementSlug: "ai-features", Threshold: 1},
	{LicenseName: "Enterprise", EntitlementSlug: "environments", Threshold: 100},
	{LicenseName: "Enterprise", EntitlementSlug: "storage-gb", Threshold: 2000},
	{LicenseName: "Enterprise", EntitlementSlug: "sso", Threshold: 1},
	{LicenseName: "Enterprise", EntitlementSlug: "support-tickets", Threshold: -1},
	{LicenseName: "Enterprise", EntitlementSlug: "audit-retention-days", Threshold: 1825},
}

// Deployment zones (from seed.sql)
var deploymentZones = []DeploymentZoneDef{
	{
		Key:                   zoneKeyProductionEU,
		Name:                  "Production EU",
		Type:                  "production",
		Description:           "Primary EU production deployment zone for customer traffic",
		Region:                "eu-west-1",
		Cluster:               "prod-eu",
		FeatureToggles:        []string{"etl", "sso", "monitoring"},
		CurrentReleaseVersion: "v1.0.0",
	},
	{
		Key:                   zoneKeyProductionUS,
		Name:                  "Production US",
		Type:                  "production",
		Description:           "Primary US production deployment zone for customer traffic",
		Region:                "us-east-1",
		Cluster:               "prod-us",
		FeatureToggles:        []string{"etl", "sso", "monitoring"},
		CurrentReleaseVersion: "v1.1.0",
	},
	{
		Key:                   zoneKeyStagingEU,
		Name:                  "Staging EU",
		Type:                  "staging",
		Description:           "EU staging deployment zone for release validation",
		Region:                "eu-central-1",
		Cluster:               "staging-eu",
		FeatureToggles:        []string{"etl", "monitoring"},
		CurrentReleaseVersion: "v1.2.0",
	},
	{
		Key:                   zoneKeyStagingUS,
		Name:                  "Staging US",
		Type:                  "staging",
		Description:           "US staging deployment zone for release validation",
		Region:                "us-west-1",
		Cluster:               "staging-us",
		FeatureToggles:        []string{"etl", "monitoring"},
		CurrentReleaseVersion: "v1.3.0",
	},
	{
		Key:                   zoneKeySandbox,
		Name:                  "Sandbox",
		Type:                  "development",
		Description:           "Sandbox deployment zone for safe product experimentation",
		Region:                "eu-west-2",
		Cluster:               "sandbox",
		FeatureToggles:        []string{"etl", "preview-data"},
		CurrentReleaseVersion: "v1.4.0",
	},
	{
		Key:                   zoneKeyDevelopment,
		Name:                  "Development",
		Type:                  "development",
		Description:           "Development deployment zone for internal workspaces",
		Region:                "us-west-2",
		Cluster:               "dev",
		FeatureToggles:        []string{"local-debug"},
		CurrentReleaseVersion: "v1.5.0",
	},
}

// Releases (from seed.sql)
var releases = []ReleaseDef{
	{
		Version:     "v1.0.0",
		Description: "Initial release with core features",
		ComponentPatches: []ReleaseComponentPatch{
			addComponent("api-gateway", "v1.0.0", "api-gateway-v1-0-0", "Routes tenant traffic to the public REST and GraphQL APIs"),
			addComponent("control-plane-web", "v1.0.0", "control-plane-web-v1-0-0", "Initial administration console for releases and deployment zones"),
			addComponent("entitlement-engine", "v1.0.0", "entitlement-engine-v1-0-0", "Evaluates license entitlements for customer environments"),
			addComponent("usage-collector", "v1.0.0", "usage-collector-v1-0-0", "Collects raw usage signals emitted by running instances"),
		},
	},
	{
		Version:         "v1.1.0",
		Description:     "Added new API endpoints and bug fixes",
		PreviousVersion: "v1.0.0",
		ComponentPatches: []ReleaseComponentPatch{
			addComponent("release-catalog-api", "v1.0.0", "release-catalog-api-v1-0-0", "Exposes the first release catalog endpoints used by the frontend"),
			addComponent("support-diagnostics", "v1.0.0", "support-diagnostics-v1-0-0", "Captures diagnostic snapshots to speed up bug investigations"),
		},
	},
	{
		Version:         "v1.2.0",
		Description:     "Performance improvements and UI updates",
		PreviousVersion: "v1.1.0",
		ComponentPatches: []ReleaseComponentPatch{
			removeComponent("control-plane-web-v1-0-0"),
			addComponent("release-console-web", "v1.0.0", "release-console-web-v1-0-0", "Introduces the faster release console with refreshed management screens"),
			addComponent("release-orchestrator", "v1.0.0", "release-orchestrator-v1-0-0", "Coordinates release rollouts across deployment zones"),
		},
	},
	{
		Version:         "v1.3.0",
		Description:     "Security hardening and observability upgrades",
		PreviousVersion: "v1.2.0",
		ComponentPatches: []ReleaseComponentPatch{
			removeComponent("usage-collector-v1-0-0"),
			addComponent("telemetry-collector", "v1.0.0", "telemetry-collector-v1-0-0", "Replaces the legacy usage collector with stronger telemetry pipelines"),
			addComponent("audit-exporter", "v1.0.0", "audit-exporter-v1-0-0", "Exports audit trails for security reviews and compliance workflows"),
		},
	},
	{
		Version:         "v1.4.0",
		Description:     "Entitlement reporting enhancements",
		PreviousVersion: "v1.3.0",
		ComponentPatches: []ReleaseComponentPatch{
			addComponent("reporting-pipeline", "v1.0.0", "reporting-pipeline-v1-0-0", "Builds usage and entitlement reports for customer-facing analytics"),
			addComponent("entitlement-reconciler", "v1.0.0", "entitlement-reconciler-v1-0-0", "Reconciles raw usage with entitlement thresholds before reporting"),
		},
	},
	{
		Version:         "v1.5.0",
		Description:     "Scalability improvements for high-volume tenants",
		PreviousVersion: "v1.4.0",
		ComponentPatches: []ReleaseComponentPatch{
			addComponent("tenant-cache", "v1.0.0", "tenant-cache-v1-0-0", "Caches hot tenant metadata to absorb bursty multi-tenant traffic"),
			addComponent("rollout-autoscaler", "v1.0.0", "rollout-autoscaler-v1-0-0", "Automatically tunes rollout throughput for large multi-tenant deployments"),
		},
	},
}

// featureFlags is the set of feature flags seeded per organisation.
// Covers all four types (boolean, string, number, object) and all three
// targeting strategies (basic, rollout_date, rollout_percentage).
var featureFlags = []schema.FeatureFlag{
	// ── 1. New Dashboard ────────────────────────────────────────────────────
	// Boolean flag. Simple basic targeting: always "enabled" for admins,
	// "disabled" for everyone else. Has a fallback_value → appears in manifest.
	{
		Name:        "New Dashboard",
		Slug:        "new-dashboard",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "feature_flag.new_dashboard",
		Description: ptr.To("Enables the redesigned dashboard UI for the organisation"),
		Variants: []schema.Variant{
			{Name: "enabled", Value: true, Description: "New dashboard is visible"},
			{Name: "disabled", Value: false, Description: "Legacy dashboard"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Admins only", "user.role == 'admin'", "enabled"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("disabled"),
		},
		Metadata: map[string]any{
			"team":           "frontend",
			"fallback_value": false,
		},
	},

	// ── 2. Checkout v2 ──────────────────────────────────────────────────────
	// Boolean A/B test via rollout_percentage. 20 % of users see the new flow.
	// Has a fallback_value → appears in manifest.
	{
		Name:        "Checkout v2",
		Slug:        "checkout-v2",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "feature_flag.checkout_v2",
		Description: ptr.To("Gradual rollout of the revamped checkout experience"),
		Variants: []schema.Variant{
			{Name: "enabled", Value: true, Description: "New checkout flow"},
			{Name: "disabled", Value: false, Description: "Current checkout flow"},
		},
		Targetings: schema.Targetings{
			schema.NewRolloutPercentageTargeting(
				"A/B split",
				"true",
				map[string]int64{"enabled": 20, "disabled": 80},
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("disabled"),
		},
		Metadata: map[string]any{
			"experiment":     "checkout-redesign",
			"fallback_value": false,
		},
	},

	// ── 3. AI Assistant ─────────────────────────────────────────────────────
	// Boolean flag. Admins get it immediately; everyone else follows a date-based
	// rollout that goes from 0 % → 100 % over the next 3 months.
	// Has a fallback_value → appears in manifest.
	{
		Name:        "AI Assistant",
		Slug:        "ai-assistant",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "feature_flag.ai_assistant",
		Description: ptr.To("In-app AI assistant powered by the language model backend"),
		Variants: []schema.Variant{
			{Name: "enabled", Value: true, Description: "AI assistant is available"},
			{Name: "disabled", Value: false, Description: "AI assistant is hidden"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Early access – admins", "user.role == 'admin'", "enabled"),
			schema.NewRolloutDateTargeting(
				"General rollout",
				"true",
				&schema.RolloutStep{
					Variant:    "disabled",
					Percentage: 0,
					Date:       time.Now(),
				},
				&schema.RolloutStep{
					Variant:    "enabled",
					Percentage: 100,
					Date:       time.Now().AddDate(0, 3, 0),
				},
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("disabled"),
		},
		Metadata: map[string]any{
			"team":           "ai",
			"model":          "claude-sonnet-4-6",
			"fallback_value": false,
		},
	},

	// ── 4. API Rate Limit ────────────────────────────────────────────────────
	// Number flag. Three tiers: free (100 req/h), pro (5 000 req/h),
	// enterprise (unlimited = -1). Has a fallback_value → appears in manifest.
	{
		Name:        "API Rate Limit",
		Slug:        "api-rate-limit",
		Type:        "number",
		Enabled:     true,
		EventName:   "feature_flag.api_rate_limit",
		Description: ptr.To("Hourly API request limit per token, varies by plan"),
		Variants: []schema.Variant{
			{Name: "free", Value: float64(100), Description: "Free tier – 100 req/h"},
			{Name: "pro", Value: float64(5000), Description: "Pro tier – 5 000 req/h"},
			{Name: "enterprise", Value: float64(-1), Description: "Enterprise – unlimited"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Enterprise plan", "user.plan == 'enterprise'", "enterprise"),
			schema.NewBasicTargeting("Pro plan", "user.plan == 'pro'", "pro"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("free"),
		},
		Metadata: map[string]any{
			"unit":           "requests/hour",
			"fallback_value": float64(100),
		},
	},

	// ── 5. UI Theme ─────────────────────────────────────────────────────────
	// String flag. Respects explicit user preference; defaults to "light".
	// Has a fallback_value → appears in manifest.
	{
		Name:        "UI Theme",
		Slug:        "ui-theme",
		Type:        "string",
		Enabled:     true,
		EventName:   "feature_flag.ui_theme",
		Description: ptr.To("Controls the application colour theme"),
		Variants: []schema.Variant{
			{Name: "light", Value: "light", Description: "Light mode"},
			{Name: "dark", Value: "dark", Description: "Dark mode"},
			{Name: "system", Value: "system", Description: "Follow OS preference"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Dark preference", "user.theme == 'dark'", "dark"),
			schema.NewBasicTargeting("System preference", "user.theme == 'system'", "system"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("light"),
		},
		Metadata: map[string]any{
			"category":       "ui",
			"fallback_value": "light",
		},
	},

	// ── 6. Onboarding Flow ──────────────────────────────────────────────────
	// String flag. Three onboarding experiences split by percentage.
	// No fallback_value → absent from manifest (intentional).
	{
		Name:        "Onboarding Flow",
		Slug:        "onboarding-flow",
		Type:        "string",
		Enabled:     true,
		EventName:   "feature_flag.onboarding_flow",
		Description: ptr.To("Determines which onboarding variant a new user sees"),
		Variants: []schema.Variant{
			{Name: "classic", Value: "classic", Description: "Step-by-step classic wizard"},
			{Name: "guided", Value: "guided", Description: "Interactive guided tour"},
			{Name: "minimal", Value: "minimal", Description: "Skip-friendly minimal setup"},
		},
		Targetings: schema.Targetings{
			schema.NewRolloutPercentageTargeting(
				"Three-way split",
				"true",
				map[string]int64{"classic": 50, "guided": 30, "minimal": 20},
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("classic"),
		},
		Metadata: map[string]any{
			"experiment": "onboarding-v2",
			"owner":      "growth",
		},
	},

	// ── 7. Feature Limits ────────────────────────────────────────────────────
	// Object flag. Each variant is a JSON object describing plan limits.
	// Has a fallback_value → appears in manifest.
	{
		Name:        "Feature Limits",
		Slug:        "feature-limits",
		Type:        "object",
		Enabled:     true,
		EventName:   "feature_flag.feature_limits",
		Description: ptr.To("Per-plan capability limits served as a structured object"),
		Variants: []schema.Variant{
			{
				Name:        "community",
				Description: "Community plan limits",
				Value:       map[string]any{"max_projects": 3, "max_seats": 1, "ai": false},
			},
			{
				Name:        "pro",
				Description: "Pro plan limits",
				Value:       map[string]any{"max_projects": 50, "max_seats": 25, "ai": true},
			},
			{
				Name:        "enterprise",
				Description: "Enterprise plan limits",
				Value:       map[string]any{"max_projects": -1, "max_seats": -1, "ai": true},
			},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Enterprise plan", "user.plan == 'enterprise'", "enterprise"),
			schema.NewBasicTargeting("Pro plan", "user.plan == 'pro'", "pro"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("community"),
		},
		Metadata: map[string]any{
			"fallback_value": map[string]any{"max_projects": 3, "max_seats": 1, "ai": false},
		},
	},

	// ── 8. Maintenance Mode ──────────────────────────────────────────────────
	// Boolean flag, currently DISABLED at the flag level.
	// Targeting is set but never evaluated because the flag is off.
	// No fallback_value → absent from manifest.
	{
		Name:        "Maintenance Mode",
		Slug:        "maintenance-mode",
		Type:        "boolean",
		Enabled:     false,
		EventName:   "feature_flag.maintenance_mode",
		Description: ptr.To("Puts the application into read-only maintenance mode"),
		Variants: []schema.Variant{
			{Name: "active", Value: true, Description: "Maintenance mode is on"},
			{Name: "inactive", Value: false, Description: "Normal operation"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Always on (when flag enabled)", "true", "active"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("inactive"),
		},
		Metadata: map[string]any{
			"severity": "critical",
			"runbook":  "https://docs.kaiten.sh/runbooks/maintenance",
		},
	},

	// ── 9. Max Export Rows ───────────────────────────────────────────────────
	// Number flag. Soft cap on CSV/Excel exports.
	// Combines basic targeting (unlimited tier) + rollout_date (standard tier
	// gradually lifting from 5 000 to 50 000 over six months).
	// Has a fallback_value → appears in manifest.
	{
		Name:        "Max Export Rows",
		Slug:        "max-export-rows",
		Type:        "number",
		Enabled:     true,
		EventName:   "feature_flag.max_export_rows",
		Description: ptr.To("Maximum rows allowed in a single data export"),
		Variants: []schema.Variant{
			{Name: "basic", Value: float64(1000), Description: "Basic tier – 1 k rows"},
			{Name: "standard_initial", Value: float64(5000), Description: "Standard tier at launch – 5 k rows"},
			{Name: "standard_final", Value: float64(50000), Description: "Standard tier after ramp – 50 k rows"},
			{Name: "unlimited", Value: float64(-1), Description: "No limit"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Unlimited tier", "user.tier == 'unlimited'", "unlimited"),
			schema.NewRolloutDateTargeting(
				"Standard tier ramp",
				"user.tier == 'standard'",
				&schema.RolloutStep{
					Variant:    "standard_initial",
					Percentage: 0,
					Date:       time.Now(),
				},
				&schema.RolloutStep{
					Variant:    "standard_final",
					Percentage: 100,
					Date:       time.Now().AddDate(0, 6, 0),
				},
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("basic"),
		},
		Metadata: map[string]any{
			"unit":           "rows",
			"fallback_value": float64(1000),
		},
	},

	// ── 10. Beta Features ────────────────────────────────────────────────────
	// Boolean flag. Opt-in beta channel: users with beta == 'true' see it.
	// Has a fallback_value → appears in manifest.
	{
		Name:        "Beta Features",
		Slug:        "beta-features",
		Type:        "boolean",
		Enabled:     true,
		EventName:   "feature_flag.beta_features",
		Description: ptr.To("Unlocks the early-access beta feature set"),
		Variants: []schema.Variant{
			{Name: "enabled", Value: true, Description: "Beta features are visible"},
			{Name: "disabled", Value: false, Description: "Stable features only"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Beta opt-in", "user.beta == 'true'", "enabled"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("disabled"),
		},
		Metadata: map[string]any{
			"channel":        "beta",
			"fallback_value": false,
		},
	},

	// ── 11. Log Level ────────────────────────────────────────────────────────
	// String flag. Controls verbosity without a redeployment.
	// No fallback_value → absent from manifest.
	{
		Name:        "Log Level",
		Slug:        "log-level",
		Type:        "string",
		Enabled:     true,
		EventName:   "feature_flag.log_level",
		Description: ptr.To("Runtime log verbosity level for the backend services"),
		Variants: []schema.Variant{
			{Name: "error", Value: "error", Description: "Errors only"},
			{Name: "warn", Value: "warn", Description: "Warnings and errors"},
			{Name: "info", Value: "info", Description: "Informational"},
			{Name: "debug", Value: "debug", Description: "Full debug output"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Debug for internal users", "user.internal == 'true'", "debug"),
			schema.NewBasicTargeting("Warn for staging", "user.env == 'staging'", "warn"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("info"),
		},
		Metadata: map[string]any{
			"category": "observability",
		},
	},

	// ── 12. Search Algorithm ─────────────────────────────────────────────────
	// String flag with a slow date-based migration from legacy to vector search.
	// Has a fallback_value → appears in manifest.
	{
		Name:        "Search Algorithm",
		Slug:        "search-algorithm",
		Type:        "string",
		Enabled:     true,
		EventName:   "feature_flag.search_algorithm",
		Description: ptr.To("Controls which search backend is used for catalog queries"),
		Variants: []schema.Variant{
			{Name: "legacy", Value: "legacy", Description: "Trigram full-text search"},
			{Name: "vector", Value: "vector", Description: "Embedding-based semantic search"},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Internal dogfood", "user.internal == 'true'", "vector"),
			schema.NewRolloutDateTargeting(
				"Gradual migration to vector",
				"true",
				&schema.RolloutStep{
					Variant:    "legacy",
					Percentage: 0,
					Date:       time.Now().AddDate(0, 1, 0),
				},
				&schema.RolloutStep{
					Variant:    "vector",
					Percentage: 100,
					Date:       time.Now().AddDate(0, 4, 0),
				},
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("legacy"),
		},
		Metadata: map[string]any{
			"team":           "platform",
			"fallback_value": "legacy",
		},
	},
}
