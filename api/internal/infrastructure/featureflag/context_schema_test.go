package featureflag_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
)

func rootNamed(t *testing.T, nodes []featureflag.TargetingContextNode, name string) featureflag.TargetingContextNode {
	t.Helper()

	for _, node := range nodes {
		if node.Name == name {
			return node
		}
	}

	require.Failf(t, "missing node", "no node named %q", name)

	return featureflag.TargetingContextNode{}
}

func TestSchemaDescribesEveryServerNamespace(t *testing.T) {
	roots := featureflag.TargetingContextRoots(catalogue)

	facts := rootNamed(t, roots, "__kaiten")
	assert.Equal(t, featureflag.TargetingTypeObject, facts.Type)

	for _, subroot := range []string{"license", "entitlements", "instance", "customer", "deploymentZone"} {
		node := rootNamed(t, facts.Fields, subroot)
		assert.NotEmpty(t, node.Description, "subroot %q has no description to show", subroot)
	}

	// targetingKey is declared on every environment (see celVariable), so an
	// author may target on it and the editor has to offer it.
	key := rootNamed(t, roots, "targetingKey")
	assert.Equal(t, featureflag.TargetingTypeString, key.Type)
}

/*
TestSchemaOffersOnlyWhatTheLintAccepts is the check the console used to fail.

Its hand-written variable list named `license.plan` and `customer.tier`, which
have never existed. A rule written from it linted clean — an unknown root is a
host attribute, which is legitimate — and then silently never matched, which is
precisely the failure the lint exists to prevent and the one place it cannot
see. Deriving both from the fact structs is what makes that impossible; this
test is what keeps it derived.
*/
func TestSchemaOffersOnlyWhatTheLintAccepts(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")

	for _, subroot := range facts.Fields {
		if subroot.Name == "entitlements" {
			continue // keyed by slug, exercised below
		}

		for _, field := range subroot.Fields {
			rule := fmt.Sprintf("has(__kaiten.%s.%s)", subroot.Name, field.Name)
			assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue),
				"the schema offers %s.%s but the lint refuses it", subroot.Name, field.Name)
		}
	}
}

func TestSchemaOffersOnlyEntitlementFieldsTheLintAccepts(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")
	entitlements := rootNamed(t, facts.Fields, "entitlements")

	require.Equal(t, featureflag.TargetingTypeMap, entitlements.Type)
	require.NotNil(t, entitlements.Values, "an entitlement's shape is what makes the map completable")

	for _, field := range entitlements.Values.Fields {
		rule := fmt.Sprintf("has(__kaiten.entitlements['seats'].%s)", field.Name)
		assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue),
			"the schema offers entitlements[].%s but the lint refuses it", field.Name)
	}
}

// The slugs are the one part of the schema that is not derived from a struct:
// they are what this organization actually has, which is also what the lint
// checks a rule's slugs against.
func TestSchemaCarriesTheOrganizationsEntitlementSlugs(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")
	entitlements := rootNamed(t, facts.Fields, "entitlements")

	assert.Equal(t, catalogue, entitlements.KnownKeys)

	for _, slug := range entitlements.KnownKeys {
		rule := fmt.Sprintf("__kaiten.entitlements['%s'].used > 0", slug)
		assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue),
			"the schema offers the slug %q but the lint refuses it", slug)
	}
}

// A caller without a catalogue still gets the whole shape — only the slug
// suggestions are missing, which is the same trade the lint makes.
func TestSchemaWithoutACatalogue(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(nil), "__kaiten")
	entitlements := rootNamed(t, facts.Fields, "entitlements")

	assert.Empty(t, entitlements.KnownKeys)
	require.NotNil(t, entitlements.Values)
	assert.NotEmpty(t, entitlements.Values.Fields)
}

// Free-form JSONB has no shape to declare, and the lint stops at the same
// point for the same reason. Saying "map of anything" is what stops the editor
// from inventing fields underneath it.
func TestFreeFormMetadataIsDescribedAsSuch(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")
	instance := rootNamed(t, facts.Fields, "instance")

	metadata := rootNamed(t, instance.Fields, "metadata")
	assert.Equal(t, featureflag.TargetingTypeMap, metadata.Type)
	assert.Empty(t, metadata.Fields)
	require.NotNil(t, metadata.Values)
	assert.Equal(t, featureflag.TargetingTypeDyn, metadata.Values.Type)
}

// A pointer field is a value that may be absent, and CEL raises on a missing
// field rather than returning false — so which ones they are is worth telling
// an author, who can then reach for has().
func TestOptionalFieldsAreMarked(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")
	customer := rootNamed(t, facts.Fields, "customer")

	assert.True(t, rootNamed(t, customer.Fields, "domain").Optional)
	assert.False(t, rootNamed(t, customer.Fields, "slug").Optional)
}

func TestTypesAreTheOnesARuleAuthorThinksIn(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")

	entitlements := rootNamed(t, facts.Fields, "entitlements")
	require.NotNil(t, entitlements.Values)
	assert.Equal(t, featureflag.TargetingTypeNumber, rootNamed(t, entitlements.Values.Fields, "remaining").Type)
	assert.Equal(t, featureflag.TargetingTypeBoolean, rootNamed(t, entitlements.Values.Fields, "unlimited").Type)

	license := rootNamed(t, facts.Fields, "license")
	assert.Equal(t, featureflag.TargetingTypeString, rootNamed(t, license.Fields, "slug").Type)
	assert.Equal(t, featureflag.TargetingTypeString, rootNamed(t, license.Fields, "familySlug").Type)
}

// Every name the editor shows carries a sentence saying what it means. The
// point of serving the schema rather than hard-coding it in the console is
// that this travels with it.
func TestEveryLeafSaysWhatItMeans(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")

	for _, subroot := range facts.Fields {
		fields := subroot.Fields
		if subroot.Values != nil {
			fields = subroot.Values.Fields
		}

		for _, field := range fields {
			assert.NotEmpty(t, field.Description,
				"%s.%s is offered with nothing said about it", subroot.Name, field.Name)
		}
	}
}
