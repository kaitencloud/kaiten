package dogfooding

// Aliased: this package is itself named dogfooding, and an unaliased
// import would resolve `dogfooding.X` to the other package inside these
// files while meaning this one everywhere else.
import slugs "github.com/kaitencloud/kaiten/api/pkg/dogfooding"

// The slugs this package's reporter and enforcement gate against, re-exported
// so the call sites keep reading `dogfooding.CustomerEntitlementSlug`.
//
// Aliases, not copies: pkg/dogfooding holds the single declaration and the
// compiler keeps every consumer in agreement. Only the slugs Core itself
// reports against are re-exported -- the rest of the catalogue is gated,
// granted or read by the installation that holds the licences, and a constant
// here nobody reports against would read as if Core metered it.
const (
	CustomerEntitlementSlug = slugs.CustomerEntitlementSlug
	InstanceEntitlementSlug = slugs.InstanceEntitlementSlug
	LicenseEntitlementSlug  = slugs.LicenseEntitlementSlug

	EntitlementEntitlementSlug        = slugs.EntitlementEntitlementSlug
	LicenseEntitlementEntitlementSlug = slugs.LicenseEntitlementEntitlementSlug
	EntitlementGroupEntitlementSlug   = slugs.EntitlementGroupEntitlementSlug
	FeatureFlagEntitlementSlug        = slugs.FeatureFlagEntitlementSlug
	ComponentEntitlementSlug          = slugs.ComponentEntitlementSlug
	ReleaseEntitlementSlug            = slugs.ReleaseEntitlementSlug
	DeploymentZoneEntitlementSlug     = slugs.DeploymentZoneEntitlementSlug

	FeatureFlagEvaluatedEntitlementSlug      = slugs.FeatureFlagEvaluatedEntitlementSlug
	EntitlementValuesCheckedEntitlementSlug  = slugs.EntitlementValuesCheckedEntitlementSlug
	EntitlementValuesReportedEntitlementSlug = slugs.EntitlementValuesReportedEntitlementSlug
)
