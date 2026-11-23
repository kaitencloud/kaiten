package featureflag_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
)

// organization is a catalogue with one of everything, the way a console's
// organization would hold them. `scale-v1` is archived: an instance can still
// sit on it, so a rule naming it is about something real.
var organization = featureflag.TargetingCatalogue{
	Plans: []featureflag.TargetingKnownValue{
		{Value: "bronze", Label: "Bronze"},
		{Value: "silver", Label: "Silver"},
	},
	Licenses: []featureflag.TargetingKnownValue{
		{Value: "bronze-v1", Label: "Bronze", Description: "Version 1, published"},
		{Value: "silver-v1", Label: "Silver", Description: "Version 1, archived"},
		{Value: "silver-v2", Label: "Silver", Description: "Version 2, published"},
	},
	DeploymentZones: []featureflag.TargetingKnownValue{
		{Value: "eu", Label: "Europe"},
		{Value: "us", Label: "United States"},
	},
}

func TestLintAcceptsKnownValues(t *testing.T) {
	t.Parallel()

	for _, rule := range []string{
		"__kaiten.license.familySlug == 'bronze'",
		"'bronze' == __kaiten.license.familySlug",
		"__kaiten.license.familySlug != 'silver'",
		"'silver' != __kaiten.license.familySlug",
		"__kaiten.license.familySlug in ['bronze', 'silver']",
		"__kaiten.license.slug == 'bronze-v1'",
		// An archived version is a real one.
		"__kaiten.license.slug == 'silver-v1'",
		"__kaiten.license.slug in ['silver-v1', 'silver-v2']",
		"__kaiten.deploymentZone.slug == 'eu'",
		"__kaiten.deploymentZone.slug != 'us'",
		"__kaiten.license.type == 'PAID'",
		"__kaiten.license.type in ['TRIAL', 'COMMUNITY']",
		"__kaiten.instance.status != 'MAINTENANCE'",
		"'INCIDENT' == __kaiten.instance.status",
		// Only a comparison with a literal is judged: a computed operand
		// cannot be known, and a host's own attribute is not ours to check.
		"__kaiten.license.familySlug == user.plan",
		"user.plan == 'platinum'",
		"__kaiten.license.familySlug in user.plans",
		// A function asks a different question — a prefix of a plan is a
		// fair thing to test.
		"__kaiten.license.familySlug.startsWith('bro')",
		"__kaiten.license.slug.matches('^silver-')",
		"__kaiten.deploymentZone.slug.endsWith('u')",
		// Free-form facts are never refused: the lifecycle stage is only
		// suggested, a zone's type is whatever the organization calls it,
		// and customers and instances are named by slugs nobody lists.
		"__kaiten.instance.lifecycleStage == 'PROSPECT'",
		"__kaiten.deploymentZone.type == 'qa'",
		"__kaiten.customer.slug == 'acme'",
		"__kaiten.instance.slug == 'prod-1'",
		"__kaiten.instance.name == 'whatever'",
		// Not a string: nothing to look up.
		"__kaiten.license.familySlug != null",
		"has(__kaiten.license.familySlug)",
	} {
		assert.NoError(t, featureflag.LintTargetingRule(rule, organization), "rule: %s", rule)
		assert.Empty(t, featureflag.LintTargetingRuleIssues(rule, organization), "rule: %s", rule)
	}
}

func TestLintRefusesAnUnknownValue(t *testing.T) {
	t.Parallel()

	for _, c := range []struct {
		name       string
		rule       string
		underlined string
		message    string
	}{
		{
			name:       "plan",
			rule:       "__kaiten.license.familySlug == 'bronzee'",
			underlined: "'bronzee'",
			message:    "compares __kaiten.license.familySlug with 'bronzee', which is not a plan of this organization — available: bronze, silver",
		},
		{
			name:       "plan on the left",
			rule:       "'gold' == __kaiten.license.familySlug",
			underlined: "'gold'",
			message:    "compares __kaiten.license.familySlug with 'gold', which is not a plan of this organization",
		},
		{
			name:       "not equal",
			rule:       "__kaiten.license.familySlug != 'gold'",
			underlined: "'gold'",
			message:    "which is not a plan of this organization",
		},
		{
			name:       "not equal on the left",
			rule:       "'gold' != __kaiten.license.familySlug",
			underlined: "'gold'",
			message:    "which is not a plan of this organization",
		},
		{
			name:       "one bad element of a list",
			rule:       "__kaiten.license.familySlug in ['bronze', 'silvr', 'silver']",
			underlined: "'silvr'",
			message:    "compares __kaiten.license.familySlug with 'silvr', which is not a plan of this organization — available: bronze, silver",
		},
		{
			name:       "license version",
			rule:       "__kaiten.license.slug == 'bronze-v9'",
			underlined: "'bronze-v9'",
			message:    "which is not a license version of this organization — available: bronze-v1, silver-v1, silver-v2",
		},
		{
			name:       "the plan's slug is not a version's",
			rule:       "__kaiten.license.slug == 'bronze'",
			underlined: "'bronze'",
			message:    "which is not a license version of this organization",
		},
		{
			name:       "deployment zone",
			rule:       "__kaiten.deploymentZone.slug == 'asia'",
			underlined: "'asia'",
			message:    "which is not a deployment zone of this organization — available: eu, us",
		},
		{
			name:       "license type",
			rule:       "__kaiten.license.type == 'paid'",
			underlined: "'paid'",
			message:    "which is not a license type — available: COMMUNITY, DEVELOPMENT, PAID, TRIAL",
		},
		{
			name:       "instance status",
			rule:       "__kaiten.instance.status in ['HEALTHY', 'BROKEN']",
			underlined: "'BROKEN'",
			message:    "which is not an instance status — available: DEGRADED, HEALTHY, INCIDENT, MAINTENANCE",
		},
		{
			name:       "inside a larger rule",
			rule:       "__kaiten.instance.status == 'HEALTHY' &&\n  __kaiten.license.familySlug == 'gold'",
			underlined: "'gold'",
			message:    "which is not a plan of this organization",
		},
		{
			name:       "after a non-ASCII literal",
			rule:       "__kaiten.customer.domain == 'café-corp.fr' && __kaiten.license.familySlug == 'gold'",
			underlined: "'gold'",
			message:    "which is not a plan of this organization",
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			err := featureflag.LintTargetingRule(c.rule, organization)
			require.Error(t, err)
			assert.Contains(t, err.Error(), c.message)

			issues := featureflag.LintTargetingRuleIssues(c.rule, organization)
			require.Len(t, issues, 1)
			assert.Equal(t, err.Error(), issues[0].Message, "the editor and the save say the same thing")
			assert.Equal(t, c.underlined, underlined(t, c.rule, issues[0]))
		})
	}
}

// Without the part of the catalogue that knows them, a catalogue-backed fact is
// not checked — the same trade as an entitlement slug — but the closed enums
// are known without one and are always checked.
func TestLintWithoutACatalogueSkipsOnlyTheCatalogueChecks(t *testing.T) {
	t.Parallel()

	for _, rule := range []string{
		"__kaiten.license.familySlug == 'anything'",
		"__kaiten.license.slug == 'anything-v1'",
		"__kaiten.deploymentZone.slug in ['anywhere']",
	} {
		assert.NoError(t, featureflag.LintTargetingRule(rule, featureflag.TargetingCatalogue{}), "rule: %s", rule)
	}

	for _, rule := range []string{
		"__kaiten.license.type == 'FREE'",
		"__kaiten.instance.status == 'DOWN'",
		"'DOWN' != __kaiten.instance.status",
		"__kaiten.instance.status in ['HEALTHY', 'DOWN']",
	} {
		assert.Error(t, featureflag.LintTargetingRule(rule, featureflag.TargetingCatalogue{}), "rule: %s", rule)
	}
}

// A part that read cleanly and came back empty is an organization with none of
// it — not an unknown one — so nothing it could be compared with is right.
func TestLintAgainstAnEmptyPartRefusesEveryLiteral(t *testing.T) {
	t.Parallel()

	empty := featureflag.TargetingCatalogue{
		Plans:           []featureflag.TargetingKnownValue{},
		DeploymentZones: []featureflag.TargetingKnownValue{},
	}

	err := featureflag.LintTargetingRule("__kaiten.license.familySlug == 'bronze'", empty)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "available: none")

	assert.Error(t, featureflag.LintTargetingRule("__kaiten.deploymentZone.slug == 'eu'", empty))
}

// A message names a bounded number of values: an organization with a hundred
// license versions gets a sentence, not a screenful, for one typo.
func TestLintMessageBoundsTheValuesItNames(t *testing.T) {
	t.Parallel()

	versions := make([]featureflag.TargetingKnownValue, 0, 30)
	for i := range 30 {
		versions = append(versions, featureflag.TargetingKnownValue{Value: "plan-v" + string(rune('a'+i%26)) + string(rune('a'+i/26))})
	}

	err := featureflag.LintTargetingRule("__kaiten.license.slug == 'nope'",
		featureflag.TargetingCatalogue{Licenses: versions})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "… (10 more)")
	assert.Equal(t, 20, strings.Count(err.Error(), "plan-v"))
}

func TestSchemaOffersTheCatalogueAsKnownValues(t *testing.T) {
	t.Parallel()

	facts := rootNamed(t, featureflag.TargetingContextRoots(organization), "__kaiten")

	license := rootNamed(t, facts.Fields, "license")
	assert.Equal(t, organization.Plans, rootNamed(t, license.Fields, "familySlug").KnownValues)
	assert.Equal(t, organization.Licenses, rootNamed(t, license.Fields, "slug").KnownValues)

	zone := rootNamed(t, facts.Fields, "deploymentZone")
	assert.Equal(t, organization.DeploymentZones, rootNamed(t, zone.Fields, "slug").KnownValues)
}

func TestSchemaOffersTheEnumsAndSuggestionsWithoutACatalogue(t *testing.T) {
	t.Parallel()

	facts := rootNamed(t, featureflag.TargetingContextRoots(featureflag.TargetingCatalogue{}), "__kaiten")

	values := func(subroot, field string) []string {
		node := rootNamed(t, rootNamed(t, facts.Fields, subroot).Fields, field)
		names := make([]string, 0, len(node.KnownValues))
		for _, known := range node.KnownValues {
			names = append(names, known.Value)
		}

		return names
	}

	assert.Equal(t, []string{"DEVELOPMENT", "TRIAL", "PAID", "COMMUNITY"}, values("license", "type"))
	assert.Equal(t, []string{"HEALTHY", "DEGRADED", "INCIDENT", "MAINTENANCE"}, values("instance", "status"))
	assert.Equal(t, []string{"TRIAL", "ACTIVE", "AT_RISK", "CHURNED"}, values("instance", "lifecycleStage"))
	assert.Equal(t, []string{"production", "staging", "development"}, values("deploymentZone", "type"))

	// Unknown, not empty: nothing is offered for what the catalogue would fill.
	assert.Empty(t, values("license", "familySlug"))
	assert.Empty(t, values("license", "slug"))
	assert.Empty(t, values("deploymentZone", "slug"))
	assert.Empty(t, values("customer", "slug"))
}

// The suggestions are not the lint's business: a free-form field offers its
// values and accepts any other.
func TestSuggestedValuesAreNotEnforced(t *testing.T) {
	t.Parallel()

	assert.NoError(t, featureflag.LintTargetingRule("__kaiten.instance.lifecycleStage == 'PROSPECT'", organization))
	assert.NoError(t, featureflag.LintTargetingRule("__kaiten.deploymentZone.type == 'qa'", organization))
}
