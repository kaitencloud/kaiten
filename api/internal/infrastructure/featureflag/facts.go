package featureflag

import (
	"math"
	"reflect"
)

// FactsRoot is the ONE namespace the server owns in every evaluation
// context — the sole reserved identifier a rule author needs to know.
// Everything server-computed lives two levels deep, e.g. `__kaiten.license.slug`,
// so a host is never blocked from using bare words like `license` or
// `instance` for its own attributes. Double-underscore-prefixed to match
// dogfooding/reporter.go's existing internal-marker convention
// (internalEvaluationContextKey) and to make forging it even less likely
// than a bare word would be. A rule may read anything under here; nothing a
// caller sends can set it (see ofrep.ResetKaitenFacts), and a typo in a
// sub-field is a mistake worth refusing rather than discovering in
// production. celVariable is where it gets its CEL type, once, for the
// linter and the runtime alike.
const FactsRoot = "__kaiten"

// The sub-roots under FactsRoot. The enrichment that fills them lives in
// modules/featureflags/openfeature/ofrep, which reads these constants rather
// than repeating the strings.
const (
	LicenseRoot        = "license"
	EntitlementsRoot   = "entitlements"
	InstanceRoot       = "instance"
	CustomerRoot       = "customer"
	DeploymentZoneRoot = "deploymentZone"
)

// factsSubroots is every name that exists directly under FactsRoot. The rest
// of a rule lives in an open world — a host may send any attribute — but this
// namespace is reserved and entirely server-written, so here the list is
// closed and a name outside it is a mistake the lint can call.
var factsSubroots = []string{
	LicenseRoot, EntitlementsRoot, InstanceRoot, CustomerRoot, DeploymentZoneRoot,
}

// Typed shapes for every fact written under FactsRoot. A field's name is
// declared exactly once — its json tag — instead of being hand-typed
// separately in the enrichment code, in the lint's known-fields list, and in
// every test that reads it back. The struct also makes the *building* code
// compiler-checked: a typo'd or missing field is caught at compile time, not
// discovered when a rule silently fails to match at runtime.
//
// They live in this infrastructure package rather than in ofrep because the
// targeting lint has to read them, and infrastructure cannot import a module.
// Keeping them next to the linter is what stops the two descriptions of the
// same namespace from drifting apart — which they already had: the lint's
// hand-written list and the structs disagreed on `license.isActive` and on
// the shape of an entitlement's usage.
//
// CEL still ultimately needs a dynamic map — openfeature.EvaluationContext.Inputs
// is map[string]interface{}, and CEL's DynType is how a rule indexes into it
// (required for entitlements['seats'], where the key is a runtime slug, not
// a fixed field) — so ofrep converts a struct to that shape at the one point
// it's actually needed, via a JSON round-trip that reads these same tags.
// Everything upstream of that call stays a plain Go struct.
type (
	// LicenseFact is written under __kaiten.license:
	// `__kaiten.license.familySlug == 'scale'`.
	//
	// A license is one version of a product. Slug names that version,
	// and a new version comes with a new one (scale, then scale-v2); FamilySlug
	// names the product and stays put. A rule meant for a product reads
	// FamilySlug, or it silently stops matching the day a version is added.
	LicenseFact struct {
		Slug       string `json:"slug" doc:"Slug of the license version the organization holds, e.g. 'scale-v2'. Each version has its own, so a rule on it matches that version only; target the product with familySlug"`
		FamilySlug string `json:"familySlug" doc:"Slug of the product the license is a version of, e.g. 'scale'. The same for every version, including ones published later"`
		Type       string `json:"type" doc:"Whether the license is paid or not, e.g. 'PAID'"`
	}

	// EntitlementFact is the value type of the map written under
	// __kaiten.entitlements — keyed by entitlement slug, itself dynamic (an
	// org can define any slug), so the outer map stays map[string]any, but
	// each entry's shape is fixed: `__kaiten.entitlements['seats'].percentage`.
	// No omitempty anywhere here — a rule reading an absent field does not get
	// false, it gets a CEL error — so every field is always present: an
	// entitlement with no ceiling reports UnlimitedQuantity rather than
	// omitting the number (see ofrep's entitlementFacts).
	//
	// Every grant has the same shape, whatever its entitlement's type. A
	// NUMBER grant reports its cap and the usage measured against it. A
	// BOOLEAN grant reports a ceiling of 1 when the license grants it and 0
	// when it does not, with nothing used — `limit >= 1.0` reads "granted".
	// A CONFIG grant has no quantity, and reports zeros.
	EntitlementFact struct {
		Limit      float64 `json:"limit" doc:"Ceiling granted for this entitlement. An entitlement with no ceiling reports a very large number rather than zero, so '< 5' means what it reads. A BOOLEAN entitlement reports 1 when the license grants it and 0 when it does not"`
		Used       float64 `json:"used" doc:"How much of the entitlement is currently consumed"`
		Remaining  float64 `json:"remaining" doc:"Ceiling minus usage. Unlimited entitlements report a very large number"`
		Percentage float64 `json:"percentage" doc:"Share of the ceiling consumed, between 0 and 1"`
		Unlimited  bool    `json:"unlimited" doc:"True when the entitlement has no ceiling — clearer than comparing against the sentinel limit"`
	}

	// InstanceFact is written under __kaiten.instance:
	// `__kaiten.instance.metadata.demo == true`. Metadata stays map[string]any
	// deliberately — it is genuinely free-form, org-defined JSONB with no fixed
	// shape to declare a struct for; that's the correct place for dynamic
	// typing to remain, not a gap in this cleanup.
	InstanceFact struct {
		ID             string         `json:"id" doc:"Identifier of the instance being evaluated"`
		Slug           string         `json:"slug" doc:"URL-friendly identifier of the instance"`
		Name           string         `json:"name" doc:"Display name of the instance"`
		Status         string         `json:"status" doc:"Operational status of the instance, e.g. 'HEALTHY'"`
		LifecycleStage *string        `json:"lifecycleStage,omitempty" doc:"Lifecycle stage of the instance, when one is set"`
		Metadata       map[string]any `json:"metadata" doc:"Free-form metadata the organization sets on the instance. Any key is allowed, so nothing below this point is checked"`
	}

	// CustomerFact is written under __kaiten.customer:
	// `__kaiten.customer.domain == 'acme.com'`.
	CustomerFact struct {
		ID                 string  `json:"id" doc:"Identifier of the customer the instance belongs to"`
		Name               string  `json:"name" doc:"Display name of the customer"`
		Slug               string  `json:"slug" doc:"URL-friendly identifier of the customer"`
		ExternalCustomerID *string `json:"externalCustomerId,omitempty" doc:"Identifier the customer carries in your own systems, when one is set"`
		Domain             *string `json:"domain,omitempty" doc:"Email domain of the customer, when one is set, e.g. 'acme.com'"`
	}

	// DeploymentZoneFact is written under __kaiten.deploymentZone:
	// `__kaiten.deploymentZone.currentReleaseId == '...'`.
	DeploymentZoneFact struct {
		ID               string         `json:"id" doc:"Identifier of the deployment zone the instance runs in"`
		Name             string         `json:"name" doc:"Display name of the deployment zone"`
		Slug             string         `json:"slug" doc:"URL-friendly identifier of the deployment zone"`
		Type             string         `json:"type" doc:"Environment class of the zone. Free-form, but 'production', 'staging' and 'development' are the ones the console labels"`
		Metadata         map[string]any `json:"metadata" doc:"Free-form metadata set on the deployment zone. Any key is allowed, so nothing below this point is checked"`
		CurrentReleaseID *string        `json:"currentReleaseId,omitempty" doc:"Identifier of the release currently deployed to the zone, when one is set"`
	}
)

/*
UnlimitedQuantity is what an entitlement with no ceiling reports for `limit`
and `remaining`. A real number, deliberately — both alternatives re-create the
bug they would replace.

Zero was the original, and it inverted every rule written on it:
`entitlements['seats'].remaining < 5` is how you catch a customer running out,
and zero made it match for precisely the customers who cannot. Omitting the
fields instead is no better. CEL raises "no such key" on an absent field rather
than returning false, so `remaining > 1000` — the rule that rewards an uncapped
plan — stops matching too; whether that error is even survivable depends on how
the rule is composed, since `a || b` absorbs it and a bare comparison does not.
It would also make the lint dishonest: it derives its field list from
EntitlementFact and tells an author `remaining` is available, and it sees rules,
never values, so it could never say when it is not.

math.MaxFloat64 rather than an infinity because the facts go through a JSON
round-trip (ofrep.toFactMap) and +Inf is not representable in JSON, which would
drop the whole entitlement. Every comparison a rule can write then comes out the
way it reads — `< 5` false, `> 1000` true, `percentage >= 0.9` false — and
`unlimited` remains for an author who prefers to say it outright.
*/
const UnlimitedQuantity = math.MaxFloat64

// The names a rule may read under each sub-root, derived from the structs
// above instead of retyped. Only the top level of each fact is listed:
// metadata is free-form JSONB an org can put any key in, so
// `__kaiten.instance.metadata.demo` cannot be validated the way a fixed field
// like `__kaiten.license.type` can, and the lint stops at "metadata".
var (
	licenseFields        = factFields[LicenseFact]()
	entitlementFields    = factFields[EntitlementFact]()
	instanceFields       = factFields[InstanceFact]()
	customerFields       = factFields[CustomerFact]()
	deploymentZoneFields = factFields[DeploymentZoneFact]()
)

// factFields reads the json tag names off a fact struct, in declaration
// order — the same names the JSON round-trip in ofrep produces, so the list
// the lint accepts and the map the server writes cannot disagree.
//
// Expressed over structNodes, which reads those same tags to build the schema
// the console completes against (context_schema.go). One walk, so the names
// the linter accepts are by construction the names the editor offers.
func factFields[T any]() []string {
	nodes := structNodes(reflect.TypeFor[T]())

	names := make([]string, 0, len(nodes))
	for _, node := range nodes {
		names = append(names, node.Name)
	}

	return names
}
