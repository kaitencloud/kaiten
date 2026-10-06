package dogfooding

// Aliased: this package is itself named dogfooding, and an unaliased
// import would resolve `dogfooding.X` to the other package inside these
// files while meaning this one everywhere else.
import slugs "github.com/kaitencloud/kaiten/api/pkg/dogfooding"

// The slugs this package's reporter and enforcement gate against, re-exported
// so the ~90 call sites keep reading `dogfooding.CustomerEntitlementSlug`.
//
// Aliases, not copies: pkg/dogfooding holds the single declaration and the
// compiler keeps every consumer in agreement. Adding a slug means adding it
// there.
const (
	CustomerEntitlementSlug              = slugs.CustomerEntitlementSlug
	CustomerReadEntitlementSlug          = slugs.CustomerReadEntitlementSlug
	CustomerUpdatedEntitlementSlug       = slugs.CustomerUpdatedEntitlementSlug
	ComponentEntitlementSlug             = slugs.ComponentEntitlementSlug
	ComponentReadEntitlementSlug         = slugs.ComponentReadEntitlementSlug
	ComponentUpdatedEntitlementSlug      = slugs.ComponentUpdatedEntitlementSlug
	EntitlementEntitlementSlug           = slugs.EntitlementEntitlementSlug
	EntitlementReadEntitlementSlug       = slugs.EntitlementReadEntitlementSlug
	EntitlementUpdatedEntitlementSlug    = slugs.EntitlementUpdatedEntitlementSlug
	FeatureFlagEntitlementSlug           = slugs.FeatureFlagEntitlementSlug
	FeatureFlagReadEntitlementSlug       = slugs.FeatureFlagReadEntitlementSlug
	FeatureFlagEvaluatedEntitlementSlug  = slugs.FeatureFlagEvaluatedEntitlementSlug
	FeatureFlagUpdatedEntitlementSlug    = slugs.FeatureFlagUpdatedEntitlementSlug
	LicenseEntitlementSlug               = slugs.LicenseEntitlementSlug
	LicenseReadEntitlementSlug           = slugs.LicenseReadEntitlementSlug
	LicenseUpdatedEntitlementSlug        = slugs.LicenseUpdatedEntitlementSlug
	InstanceEntitlementSlug              = slugs.InstanceEntitlementSlug
	InstanceReadEntitlementSlug          = slugs.InstanceReadEntitlementSlug
	InstanceUpdatedEntitlementSlug       = slugs.InstanceUpdatedEntitlementSlug
	ReleaseEntitlementSlug               = slugs.ReleaseEntitlementSlug
	ReleaseReadEntitlementSlug           = slugs.ReleaseReadEntitlementSlug
	DeploymentZoneEntitlementSlug        = slugs.DeploymentZoneEntitlementSlug
	DeploymentZoneReadEntitlementSlug    = slugs.DeploymentZoneReadEntitlementSlug
	DeploymentZoneUpdatedEntitlementSlug = slugs.DeploymentZoneUpdatedEntitlementSlug

	EntitlementValuesCheckedEntitlementSlug  = slugs.EntitlementValuesCheckedEntitlementSlug
	EntitlementValuesReportedEntitlementSlug = slugs.EntitlementValuesReportedEntitlementSlug

	LicenseEntitlementEntitlementSlug        = slugs.LicenseEntitlementEntitlementSlug
	LicenseEntitlementReadEntitlementSlug    = slugs.LicenseEntitlementReadEntitlementSlug
	LicenseEntitlementUpdatedEntitlementSlug = slugs.LicenseEntitlementUpdatedEntitlementSlug
	EntitlementGroupEntitlementSlug          = slugs.EntitlementGroupEntitlementSlug
	EntitlementGroupReadEntitlementSlug      = slugs.EntitlementGroupReadEntitlementSlug
	EntitlementGroupUpdatedEntitlementSlug   = slugs.EntitlementGroupUpdatedEntitlementSlug
	MetadataFieldEntitlementSlug             = slugs.MetadataFieldEntitlementSlug
	MetadataFieldReadEntitlementSlug         = slugs.MetadataFieldReadEntitlementSlug
	MetadataFieldUpdatedEntitlementSlug      = slugs.MetadataFieldUpdatedEntitlementSlug
	ServiceAccountEntitlementSlug            = slugs.ServiceAccountEntitlementSlug
	ServiceAccountReadEntitlementSlug        = slugs.ServiceAccountReadEntitlementSlug
	ServiceAccountUpdatedEntitlementSlug     = slugs.ServiceAccountUpdatedEntitlementSlug
	ServiceAccountTokenEntitlementSlug       = slugs.ServiceAccountTokenEntitlementSlug
	ServiceAccountTokenReadEntitlementSlug   = slugs.ServiceAccountTokenReadEntitlementSlug

	// Connector entitlements are BOOLEAN and read rather than reported: see
	// entitlements.go, and pkg/dogfooding for why each connector has its own slug.
	ConnectorAttioEntitlementSlug = slugs.ConnectorAttioEntitlementSlug
	BillingEntitlementSlug        = slugs.BillingEntitlementSlug

	// CONFIG entitlements are read through ConfigValue, never reported.
	UsageHistoryRetentionEntitlementSlug = slugs.UsageHistoryRetentionEntitlementSlug
)
