package featureflags_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/gettargetingcontext"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/linttargetingrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// nodeNamed returns the node with the given name, failing if there is none.
func nodeNamed(t *testing.T, nodes []featureflag.TargetingContextNode, name string) featureflag.TargetingContextNode {
	t.Helper()

	for _, node := range nodes {
		if node.Name == name {
			return node
		}
	}

	require.Failf(t, "missing node", "no node named %q", name)

	return featureflag.TargetingContextNode{}
}

func lint(t *testing.T, rule string) linttargetingrule.TargetingRuleVerdict {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags/targeting/lint",
		linttargetingrule.TargetingRuleDraft{Rule: rule})
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[linttargetingrule.TargetingRuleVerdict](t, resp, fiber.StatusOK)
}

func targetingContext(t *testing.T) gettargetingcontext.TargetingContext {
	t.Helper()

	req := httptest.NewRequest("GET", "/api/feature-flags/targeting/context", nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[gettargetingcontext.TargetingContext](t, resp, fiber.StatusOK)
}

func TestGetTargetingContext(t *testing.T) {
	t.Run("WhenNoEntitlementsExist_StillDescribesTheServerFacts", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		actual := targetingContext(t)

		// Assert
		facts := nodeNamed(t, actual.Roots, "__kaiten")
		assert.Equal(t, featureflag.TargetingTypeObject, facts.Type)
		for _, subroot := range []string{"license", "entitlements", "instance", "customer", "deploymentZone"} {
			assert.NotEmpty(t, nodeNamed(t, facts.Fields, subroot).Description)
		}

		// Declared on every environment, so a rule may target on it.
		assert.Equal(t, featureflag.TargetingTypeString, nodeNamed(t, actual.Roots, "targetingKey").Type)

		entitlements := nodeNamed(t, facts.Fields, "entitlements")
		assert.Empty(t, entitlements.KnownKeys)
		require.NotNil(t, entitlements.Values, "an entitlement's shape is what makes the map completable")
	})

	// The slugs are the one part of the schema that is not derived from a
	// struct: they are what this organization actually has, which is also what
	// the write path checks a rule's slugs against.
	t.Run("WhenEntitlementsExist_OffersTheirSlugsAsKeys", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		payload := entitlementschema.Entitlement{
			Name: "Seats",
			Type: ptr.To(entitlementschema.Number),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		created := commonfixture.AssertJSONResponse[entitlementschema.Entitlement](t, resp, fiber.StatusCreated)

		// Act
		actual := targetingContext(t)

		// Assert
		facts := nodeNamed(t, actual.Roots, "__kaiten")
		entitlements := nodeNamed(t, facts.Fields, "entitlements")
		assert.Contains(t, entitlements.KnownKeys, created.Slug)
	})
}

func TestLintTargetingRule(t *testing.T) {
	t.Run("WhenTheRuleWorks_ReportsNothing", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		for _, rule := range []string{
			"true",
			"__kaiten.license.slug == 'scale'",
			// A host's own attributes: the world is not closed, and a rule
			// targeting on them is legitimate.
			"user.cohort == 'beta'",
		} {
			// Act
			actual := lint(t, rule)

			// Assert
			assert.True(t, actual.Valid, "rule: %s", rule)
			assert.Empty(t, actual.Issues, "rule: %s", rule)
		}
	})

	// A rejected rule is an answer, not a client error: this is called on every
	// keystroke, where being told no is the ordinary case.
	t.Run("WhenTheRuleCannotWork_AnswersOkWithTheProblem", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		actual := lint(t, "__kaiten.license.tier == 'scale'")

		// Assert
		require.False(t, actual.Valid)
		require.Len(t, actual.Issues, 1)
		assert.Contains(t, actual.Issues[0].Message, "slug, familySlug, type")
		// Positioned on `.tier`, so the editor underlines the mistake itself.
		assert.Equal(t, 1, actual.Issues[0].Line)
		assert.Equal(t, 17, actual.Issues[0].Column)
		assert.Equal(t, 22, actual.Issues[0].EndColumn)
	})

	// The editor says it while the rule is typed, in the words the save will
	// refuse it with: about the rule as a whole, since no one name in it is
	// the mistake.
	t.Run("WhenTheRuleIsTooCostlyToEvaluate_SaysSoWithoutAPosition", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		actual := lint(t, literalLoops(100, 3))

		// Assert
		require.False(t, actual.Valid)
		require.Len(t, actual.Issues, 1)
		assert.Contains(t, actual.Issues[0].Message, "could cost up to")
		assert.Zero(t, actual.Issues[0].Line)
	})

	t.Run("WhenTheEntitlementIsNotInTheCatalogue_SaysSo", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		actual := lint(t, "__kaiten.entitlements['sieges'].percentage >= 0.9")

		// Assert
		require.False(t, actual.Valid)
		require.Len(t, actual.Issues, 1)
		assert.Contains(t, actual.Issues[0].Message, "sieges")
		assert.Contains(t, actual.Issues[0].Message, "does not have")
	})

	/*
	   The property the editor is worth trusting for.

	   The console lints while the rule is typed and the API lints again on
	   save. If those could disagree, the editor would be another hand-written
	   approximation of the rules — which is exactly what the variable list it
	   replaced was.
	*/
	t.Run("WhenARuleIsSaved_TheVerdictIsTheSame", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		const rule = "__kaiten.instance.stauts == 'HEALTHY'"

		// Act
		verdict := lint(t, rule)

		payload := schema.FeatureFlag{
			Name: "Refused",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true, Description: "Enabled variant"},
				{Name: "disabled", Value: false, Description: "Disabled variant"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Default", rule, "enabled"),
			},
			Metadata:       map[string]any{},
			Enabled:        true,
			EventName:      "refused",
			Slug:           "refused",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		assert.False(t, verdict.Valid, "the editor accepted a rule the save refuses")
		assert.NotEqual(t, fiber.StatusCreated, resp.StatusCode,
			"the save accepted a rule the editor refuses")
	})
}
