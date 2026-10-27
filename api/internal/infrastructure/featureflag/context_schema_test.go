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
	seats := rootNamed(t, entitlements.Entries, "seats")
	require.NotEmpty(t, seats.Fields, "a NUMBER entitlement's fields are what make it completable")

	for _, field := range seats.Fields {
		rule := fmt.Sprintf("has(__kaiten.entitlements['seats'].%s)", field.Name)
		assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue),
			"the schema offers entitlements['seats'].%s but the lint refuses it", field.Name)
	}
}

// Each entitlement is described in the shape it reads in, which is the shape
// the lint holds a rule to: the editor never offers what the save refuses.
func TestSchemaDescribesEachEntitlementInItsShape(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")
	entitlements := rootNamed(t, facts.Fields, "entitlements")

	assert.Nil(t, entitlements.Values, "entries differ, so there is no shape they share")

	sso := rootNamed(t, entitlements.Entries, "sso")
	assert.Equal(t, featureflag.TargetingTypeBoolean, sso.Type)
	assert.Empty(t, sso.Fields)
	assert.NoError(t, featureflag.LintTargetingRule("__kaiten.entitlements['sso'] == true", catalogue))

	support := rootNamed(t, entitlements.Entries, "support")
	assert.Equal(t, featureflag.TargetingTypeMap, support.Type)
	require.NotNil(t, support.Values)
	assert.Equal(t, featureflag.TargetingTypeDyn, support.Values.Type)

	assert.Equal(t, featureflag.TargetingTypeObject, rootNamed(t, entitlements.Entries, "seats").Type)
}

// The slugs are the one part of the schema that is not derived from a struct:
// they are what this organization actually has, which is also what the lint
// checks a rule's slugs against.
func TestSchemaCarriesTheOrganizationsEntitlementSlugs(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(catalogue), "__kaiten")
	entitlements := rootNamed(t, facts.Fields, "entitlements")

	slugs := make([]string, 0, len(catalogue))
	for _, known := range catalogue {
		slugs = append(slugs, known.Slug)
	}
	assert.Equal(t, slugs, entitlements.KnownKeys)

	for _, entry := range entitlements.Entries {
		slug := entry.Name
		rule := map[featureflag.TargetingValueType]string{
			featureflag.TargetingTypeObject:  fmt.Sprintf("__kaiten.entitlements['%s'].used > 0", slug),
			featureflag.TargetingTypeBoolean: fmt.Sprintf("__kaiten.entitlements['%s'] == true", slug),
			featureflag.TargetingTypeMap:     fmt.Sprintf("__kaiten.entitlements['%s'].tier == 'x'", slug),
		}[entry.Type]
		require.NotEmptyf(t, rule, "no rule for an entry of type %q", entry.Type)
		assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue),
			"the schema offers the slug %q but the lint refuses it", slug)
	}
}

// A caller without a catalogue still gets the whole shape — only the
// entitlements are missing, slugs and shapes alike, since a slug's shape comes
// from its type. The lint makes the same trade.
func TestSchemaWithoutACatalogue(t *testing.T) {
	facts := rootNamed(t, featureflag.TargetingContextRoots(nil), "__kaiten")
	entitlements := rootNamed(t, facts.Fields, "entitlements")

	assert.Equal(t, featureflag.TargetingTypeMap, entitlements.Type)
	assert.Empty(t, entitlements.KnownKeys)
	assert.Empty(t, entitlements.Entries)
	assert.NotEmpty(t, rootNamed(t, facts.Fields, "license").Fields)
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

	seats := rootNamed(t, rootNamed(t, facts.Fields, "entitlements").Entries, "seats")
	assert.Equal(t, featureflag.TargetingTypeNumber, rootNamed(t, seats.Fields, "remaining").Type)
	assert.Equal(t, featureflag.TargetingTypeBoolean, rootNamed(t, seats.Fields, "unlimited").Type)

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
		for _, entry := range subroot.Entries {
			fields = append(fields, entry)
			fields = append(fields, entry.Fields...)
		}

		for _, field := range fields {
			assert.NotEmpty(t, field.Description,
				"%s.%s is offered with nothing said about it", subroot.Name, field.Name)
		}
	}
}

func TestKnownEntriesRetainDeclaredTypesWithoutChangingEvaluationShapes(t *testing.T) {
	t.Parallel()
	roots := featureflag.TargetingContextRoots([]featureflag.KnownEntitlement{
		{Slug: "pool", Type: featureflag.EntitlementNumber, DeclaredType: "NUMBER_AI_CREDIT"},
		{Slug: "quota", Type: featureflag.EntitlementNumber, DeclaredType: "NUMBER"},
		{Slug: "config", Type: featureflag.EntitlementConfig, DeclaredType: "CONFIG"},
	})
	entitlements := rootNamed(t, rootNamed(t, roots, "__kaiten").Fields, "entitlements")
	pool := rootNamed(t, entitlements.Entries, "pool")
	require.Equal(t, "NUMBER_AI_CREDIT", pool.EntitlementType)
	require.Equal(t, featureflag.TargetingTypeObject, pool.Type)
	quota := rootNamed(t, entitlements.Entries, "quota")
	require.Equal(t, "NUMBER", quota.EntitlementType)
	require.Equal(t, pool.Type, quota.Type)
	config := rootNamed(t, entitlements.Entries, "config")
	require.Equal(t, "CONFIG", config.EntitlementType)
	require.Empty(t, config.Values.EntitlementType, "arbitrary CONFIG keys have no catalogue annotation")
}
