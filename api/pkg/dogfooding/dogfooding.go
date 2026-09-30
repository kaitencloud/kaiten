// Package dogfooding holds the entitlement and entitlement-group slugs of
// kaiten's own metering catalogue -- the vocabulary, and nothing else.
package dogfooding

// Entitlement slugs. Each product resource has up to three: <resource> is
// the headline write quota, <resource>-read and <resource>-updated are the
// Observability counters.
const (
	CustomerEntitlementSlug              = "customers"
	CustomerReadEntitlementSlug          = "customers-read"
	CustomerUpdatedEntitlementSlug       = "customers-updated"
	ComponentEntitlementSlug             = "components"
	ComponentReadEntitlementSlug         = "components-read"
	ComponentUpdatedEntitlementSlug      = "components-updated"
	EntitlementEntitlementSlug           = "entitlements"
	EntitlementReadEntitlementSlug       = "entitlements-read"
	EntitlementUpdatedEntitlementSlug    = "entitlements-updated"
	FeatureFlagEntitlementSlug           = "feature-flags"
	FeatureFlagReadEntitlementSlug       = "feature-flags-read"
	FeatureFlagEvaluatedEntitlementSlug  = "feature-flags-evaluated"
	FeatureFlagUpdatedEntitlementSlug    = "feature-flags-updated"
	LicenseEntitlementSlug               = "licenses"
	LicenseReadEntitlementSlug           = "licenses-read"
	LicenseUpdatedEntitlementSlug        = "licenses-updated"
	InstanceEntitlementSlug              = "instances"
	InstanceReadEntitlementSlug          = "instances-read"
	InstanceUpdatedEntitlementSlug       = "instances-updated"
	ReleaseEntitlementSlug               = "releases"
	ReleaseReadEntitlementSlug           = "releases-read"
	DeploymentZoneEntitlementSlug        = "deployment-zones"
	DeploymentZoneReadEntitlementSlug    = "deployment-zones-read"
	DeploymentZoneUpdatedEntitlementSlug = "deployment-zones-updated"

	EntitlementValuesCheckedEntitlementSlug  = "entitlement-values-checked"
	EntitlementValuesReportedEntitlementSlug = "entitlement-values-reported"
)

// Quota-defining resources. Entitlement groups, license-entitlement
// grants, metadata fields, service accounts and their tokens are all
// resources the product provisions and the customer can exhaust, but none of
// them had a catalogue slug -- so the handlers that define what a customer
// may do reported nothing at all, while every ordinary resource handler
// reported.
const (
	LicenseEntitlementEntitlementSlug        = "license-entitlements"
	LicenseEntitlementReadEntitlementSlug    = "license-entitlements-read"
	LicenseEntitlementUpdatedEntitlementSlug = "license-entitlements-updated"
	EntitlementGroupEntitlementSlug          = "entitlement-groups"
	EntitlementGroupReadEntitlementSlug      = "entitlement-groups-read"
	EntitlementGroupUpdatedEntitlementSlug   = "entitlement-groups-updated"
	MetadataFieldEntitlementSlug             = "metadata-fields"
	MetadataFieldReadEntitlementSlug         = "metadata-fields-read"
	MetadataFieldUpdatedEntitlementSlug      = "metadata-fields-updated"
	ServiceAccountEntitlementSlug            = "service-accounts"
	ServiceAccountReadEntitlementSlug        = "service-accounts-read"
	ServiceAccountUpdatedEntitlementSlug     = "service-accounts-updated"
	ServiceAccountTokenEntitlementSlug       = "service-account-tokens"
	ServiceAccountTokenReadEntitlementSlug   = "service-account-tokens-read"
)

// Connector entitlement slugs (BOOLEAN). Connectors are an enterprise feature
// carried by a licence, and licensed one at a time: an organization may have
// Attio and not the next one, so each gets a slug rather than there being a
// single "connectors" quota.
//
// BOOLEAN rather than NUMBER because the question is "is this sold to this
// organization", not "how many have they used". A BOOLEAN entitlement carries the
// licence grant in its value, which is what makes it readable without reporting
// usage -- an activation page renders what is available and must not spend quota
// to find out.
//
// Which slug gates which connector is declared BY the connector when it registers
// (see connector.entitlement_slug), not mapped in kaiten. These constants exist so
// the connectors kaiten itself ships name the same strings the bootstrap creates,
// for the reason this whole package exists.
const (
	ConnectorAttioEntitlementSlug = "connector-attio"
)

// Entitlement group slugs. Groups give the SDK its presentation/category axis
// so the storefront renders meaningful sections instead of a flat list. The
// headline resource quotas land in customer-facing groups; the raw
// read/updated/evaluated counters land in "Observability" (the long tail the
// SDK collapses).
const (
	GroupPlatformSlug      = "platform"
	GroupLicensingSlug     = "licensing-access"
	GroupObservabilitySlug = "observability"
)

// EntitlementSlugs is every slug in the catalogue, headline quotas and
// Observability counters alike.
var EntitlementSlugs = []string{
	CustomerEntitlementSlug,
	CustomerReadEntitlementSlug,
	CustomerUpdatedEntitlementSlug,
	ComponentEntitlementSlug,
	ComponentReadEntitlementSlug,
	ComponentUpdatedEntitlementSlug,
	EntitlementEntitlementSlug,
	EntitlementReadEntitlementSlug,
	EntitlementUpdatedEntitlementSlug,
	FeatureFlagEntitlementSlug,
	FeatureFlagReadEntitlementSlug,
	FeatureFlagEvaluatedEntitlementSlug,
	FeatureFlagUpdatedEntitlementSlug,
	LicenseEntitlementSlug,
	LicenseReadEntitlementSlug,
	LicenseUpdatedEntitlementSlug,
	InstanceEntitlementSlug,
	InstanceReadEntitlementSlug,
	InstanceUpdatedEntitlementSlug,
	ReleaseEntitlementSlug,
	ReleaseReadEntitlementSlug,
	DeploymentZoneEntitlementSlug,
	DeploymentZoneReadEntitlementSlug,
	DeploymentZoneUpdatedEntitlementSlug,

	EntitlementValuesCheckedEntitlementSlug,
	EntitlementValuesReportedEntitlementSlug,

	LicenseEntitlementEntitlementSlug,
	LicenseEntitlementReadEntitlementSlug,
	LicenseEntitlementUpdatedEntitlementSlug,
	EntitlementGroupEntitlementSlug,
	EntitlementGroupReadEntitlementSlug,
	EntitlementGroupUpdatedEntitlementSlug,
	MetadataFieldEntitlementSlug,
	MetadataFieldReadEntitlementSlug,
	MetadataFieldUpdatedEntitlementSlug,
	ServiceAccountEntitlementSlug,
	ServiceAccountReadEntitlementSlug,
	ServiceAccountUpdatedEntitlementSlug,
	ServiceAccountTokenEntitlementSlug,
	ServiceAccountTokenReadEntitlementSlug,

	ConnectorAttioEntitlementSlug,
}

// BooleanEntitlementSlugs are the catalogue entries that must be created as BOOLEAN
// entitlements rather than NUMBER ones.
//
// The type is not decoration: a NUMBER entitlement carries a threshold and reports
// usage against it, a BOOLEAN one carries the grant itself. Whoever creates the
// catalogue reads this list to decide, so a slug added to EntitlementSlugs and
// forgotten here is created as a quota nobody reports against -- and the connector it
// gates reads as unentitled for every organization, because the read would find a
// number where it expects a yes.
//
// A subset of EntitlementSlugs, and disjoint from MeteredEntitlementSlugs.
var BooleanEntitlementSlugs = []string{
	ConnectorAttioEntitlementSlug,
}

// MeteredEntitlementSlugs are the headline write quotas -- the ones the SDK's
// UsageMeters render and the app gates its create actions on. The rest of the
// catalogue is read/update counters, granted unlimited and deliberately
// hidden.
//
// A subset of EntitlementSlugs, and the part a customer sees: these are the
// ones a finite threshold is worth setting on, so an entry here that the
// catalogue never created is a create path refusing writes.
var MeteredEntitlementSlugs = []string{
	CustomerEntitlementSlug,
	InstanceEntitlementSlug,
	ComponentEntitlementSlug,
	FeatureFlagEntitlementSlug,
	LicenseEntitlementSlug,
	ReleaseEntitlementSlug,
	DeploymentZoneEntitlementSlug,
	EntitlementEntitlementSlug,
	LicenseEntitlementEntitlementSlug,
	EntitlementGroupEntitlementSlug,
	MetadataFieldEntitlementSlug,
	ServiceAccountEntitlementSlug,
	ServiceAccountTokenEntitlementSlug,
}
