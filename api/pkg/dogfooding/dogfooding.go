// Package dogfooding holds the entitlement and entitlement-group slugs of
// kaiten's own metering catalogue -- the vocabulary, and nothing else.
//
// The catalogue has eighteen entitlements in four groups. Kaiten reports against
// some of them, the installation that holds the licences gates on others, and
// some are declarative terms nobody reports against at all. Every slug lives
// here, so that whoever creates the catalogue and whoever reports against it
// name the same strings.
//
// What the catalogue no longer has is a counter per read and per update of
// every resource. Those were granted unlimited on every licence and gated
// nothing; what they measured -- whether an organization uses the platform --
// is what the platform-usage group measures directly.
package dogfooding

// Quotas: the commercial axes that differ between licences. Visible to the
// customer, and live stock counters -- incremented on creation, decremented on
// deletion.
const (
	CustomerEntitlementSlug = "customers"
	InstanceEntitlementSlug = "instances"
	LicenseEntitlementSlug  = "licenses"

	// WebhookEntitlementSlug counts the outbound webhook events an
	// organization publishes, per calendar month. Kaiten does not deliver them
	// itself: the installation that does counts each event before sending it.
	// Usage over the allowance is recorded, never enforced -- the event is sent
	// and the refused report kept in the audit trail -- and only a licence that
	// grants 0 stops events. Endpoints are not counted.
	//
	// The same slug the BOOLEAN "is webhooks included" entitlement had. It is a
	// NUMBER now, and the catalogue's bootstrap recreates it rather than
	// updating it, because Core cannot change an entitlement's type in place.
	WebhookEntitlementSlug = "webhooks"

	// SeatEntitlementSlug is the human members of an organization: counted
	// when sign-in provisions a member into an organization, released when the
	// user is deleted. Agents, service accounts and MCP access never consume a
	// seat -- they join through a different door -- and it gates nothing:
	// sign-in is never refused for a quota.
	SeatEntitlementSlug = "seats"
)

// Catalog objects: stock counters on the objects an organization declares,
// unlimited on every licence and hidden from the customer. Kept for
// enforcement consistency and monitoring.
const (
	EntitlementEntitlementSlug        = "entitlements"
	LicenseEntitlementEntitlementSlug = "license-entitlements"
	EntitlementGroupEntitlementSlug   = "entitlement-groups"
	FeatureFlagEntitlementSlug        = "feature-flags"
	ComponentEntitlementSlug          = "components"
	ReleaseEntitlementSlug            = "releases"
	DeploymentZoneEntitlementSlug     = "deployment-zones"
)

// Contract: the declarative terms of a licence, each a CONFIG value. Nothing
// reports against them and nothing gates on them -- they are read, not metered.
const (
	AuditRetentionEntitlementSlug = "audit-retention"
	SupportTierEntitlementSlug    = "support-tier"
	SLAUptimeEntitlementSlug      = "sla-uptime"
)

// Platform usage: whether an organization actually uses Kaiten. Unlimited on
// every licence, hidden, never billed, and reset every calendar month.
const (
	FeatureFlagEvaluatedEntitlementSlug      = "feature-flags-evaluated"
	EntitlementValuesCheckedEntitlementSlug  = "entitlement-values-checked"
	EntitlementValuesReportedEntitlementSlug = "entitlement-values-reported"
)

// Entitlement group slugs, one per group above. Groups give the SDK its
// presentation axis; the hidden groups are the long tail the storefront
// collapses.
const (
	GroupQuotasSlug         = "quotas"
	GroupCatalogObjectsSlug = "catalog-objects"
	GroupContractSlug       = "contract"
	GroupPlatformUsageSlug  = "platform-usage"
)

// EntitlementSlugs is every slug in the catalogue, in display order within
// each group.
var EntitlementSlugs = []string{
	CustomerEntitlementSlug,
	InstanceEntitlementSlug,
	LicenseEntitlementSlug,
	WebhookEntitlementSlug,
	SeatEntitlementSlug,

	EntitlementEntitlementSlug,
	LicenseEntitlementEntitlementSlug,
	EntitlementGroupEntitlementSlug,
	FeatureFlagEntitlementSlug,
	ComponentEntitlementSlug,
	ReleaseEntitlementSlug,
	DeploymentZoneEntitlementSlug,

	AuditRetentionEntitlementSlug,
	SupportTierEntitlementSlug,
	SLAUptimeEntitlementSlug,

	FeatureFlagEvaluatedEntitlementSlug,
	EntitlementValuesCheckedEntitlementSlug,
	EntitlementValuesReportedEntitlementSlug,
}

// GatedEntitlementSlugs are the counters something is refused on: the quotas
// whose creation is limited, the webhook events a licence granting 0 stops, and
// every catalog object.
//
// A subset of EntitlementSlugs, and the part every licence must grant -- with
// a value or unlimited. A create whose entitlement the licence does not grant
// cannot have its limit verified, so it fails closed with a 503 rather than
// going through unmetered.
var GatedEntitlementSlugs = []string{
	CustomerEntitlementSlug,
	InstanceEntitlementSlug,
	LicenseEntitlementSlug,
	WebhookEntitlementSlug,

	EntitlementEntitlementSlug,
	LicenseEntitlementEntitlementSlug,
	EntitlementGroupEntitlementSlug,
	FeatureFlagEntitlementSlug,
	ComponentEntitlementSlug,
	ReleaseEntitlementSlug,
	DeploymentZoneEntitlementSlug,
}

// ConfigEntitlementSlugs are the catalogue entries created as CONFIG
// entitlements; every other entry is a NUMBER. A subset of EntitlementSlugs,
// and disjoint from GatedEntitlementSlugs -- a term of the contract has no
// count to refuse a create on.
var ConfigEntitlementSlugs = []string{
	AuditRetentionEntitlementSlug,
	SupportTierEntitlementSlug,
	SLAUptimeEntitlementSlug,
}
