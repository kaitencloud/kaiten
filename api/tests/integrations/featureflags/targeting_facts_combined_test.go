package featureflags_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func callOnServer(t *testing.T, server *tests.TestServer, method, path string, payload any, wantStatus int) {
	t.Helper()
	resp, err := server.App.Test(commonfixture.NewJSONRequest(t, method, path, payload), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, wantStatus, resp.StatusCode)
}

func createEntitlementOn(t *testing.T, server *tests.TestServer, payload map[string]any) {
	t.Helper()
	callOnServer(t, server, http.MethodPost, "/api/entitlements", payload, fiber.StatusCreated)
}

func creditsWorld(t *testing.T, server *tests.TestServer, pool bool) (customerSlug string, instanceID uuid.UUID) {
	t.Helper()
	createEntitlementOn(t, server, map[string]any{
		"name": "Firecrawl", "slug": "firecrawl-credits", "description": "d", "type": "NUMBER", "aggregationMethod": "SUM",
	})
	second := map[string]any{"name": "Pages", "slug": "scraped-pages", "description": "d", "type": "NUMBER", "aggregationMethod": "SUM"}
	if pool {
		second["type"] = "NUMBER_AI_CREDIT"
	}
	createEntitlementOn(t, server, second)
	createEntitlementOn(t, server, map[string]any{
		"name": "Credits", "slug": "credits", "description": "d", "type": "NUMBER", "usageSource": "COMBINED_USAGE",
		"sources": []map[string]string{{"entitlementSlug": "firecrawl-credits", "weight": "0.4"}, {"entitlementSlug": "scraped-pages", "weight": "0.6"}},
	})

	customer := newTargetingCustomer(t, "Credits Co")
	license := newTargetingLicense(t, "Credits Plan")
	for _, slug := range []string{"firecrawl-credits", "scraped-pages"} {
		callOnServer(t, server, http.MethodPost, "/api/licenses/"+license.Slug+"/entitlements", map[string]any{
			"entitlementSlug": slug, "value": map[string]any{"type": "number", "value": 1000},
		}, fiber.StatusNoContent)
	}
	instance := newTargetingInstance(t, "Credits Instance", customer, license)
	for slug, value := range map[string]float64{"firecrawl-credits": 300, "scraped-pages": 100} {
		callOnServer(t, server, http.MethodPost, "/api/instances/"+instance.Slug+"/entitlements/"+slug+"/usage",
			map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"}, fiber.StatusOK)
	}

	return customer.Slug, instance.ID
}

type limitAndUsage struct {
	limit, used float64
	events      int32
}

func factFor(t *testing.T, facts []customertargetingfacts.TargetingFact, slug string) (limitAndUsage, bool) {
	t.Helper()
	for _, fact := range facts {
		if fact.EntitlementSlug == nil || *fact.EntitlementSlug != slug {
			continue
		}
		var limit struct{ Value float64 }
		var used struct {
			Value      float64
			EventCount int32 `json:"event_count"`
		}
		require.NoError(t, json.Unmarshal(fact.LimitValue, &limit))
		require.NoError(t, json.Unmarshal(fact.UsageValue, &used))
		return limitAndUsage{limit.Value, used.Value, used.EventCount}, true
	}
	return limitAndUsage{}, false
}

// A rule reads the sum of the sources an instance is granted as it reads any
// entitlement: the same facts, the same five fields derived from them.
func TestTargetingFacts_ACombinedEntitlementIsOneMoreFact(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	customerSlug, instanceID := creditsWorld(t, testServer, false)

	t.Run("OfTheCustomersOldestInstance", func(t *testing.T) {
		facts, err := customertargetingfacts.New(testServer.Dependencies.DB).GetTargetingFactsByCustomerSlug(t.Context(), testDb.DefaultData.OrganizationID, customerSlug)
		require.NoError(t, err)

		credits, found := factFor(t, facts, "credits")
		require.True(t, found, "the combined entitlement is a fact of the instance")
		assert.Equal(t, limitAndUsage{limit: 1000, used: 180, events: 2}, credits)
		sources, _ := factFor(t, facts, "firecrawl-credits")
		assert.Equal(t, limitAndUsage{limit: 1000, used: 300, events: 1}, sources, "the sources are facts as before")
	})

	t.Run("OfTheInstanceTheCallerNames", func(t *testing.T) {
		facts, err := customertargetingfacts.New(testServer.Dependencies.DB).GetTargetingFactsByInstance(t.Context(), testDb.DefaultData.OrganizationID, instanceID)
		require.NoError(t, err)

		credits, found := factFor(t, facts, "credits")
		require.True(t, found)
		assert.Equal(t, limitAndUsage{limit: 1000, used: 180, events: 2}, credits)
	})

	t.Run("TheFiveFieldsOfARule", func(t *testing.T) {
		rule := "__kaiten.entitlements['credits'].used == 180.0" +
			" && __kaiten.entitlements['credits'].limit == 1000.0" +
			" && __kaiten.entitlements['credits'].remaining == 820.0" +
			" && __kaiten.entitlements['credits'].percentage == 0.18" +
			" && __kaiten.entitlements['credits'].unlimited == false"
		callOnServer(t, testServer, http.MethodPost, "/api/feature-flags", schema.FeatureFlag{
			Name: "Credits rule", Slug: "credits-rule", Type: "boolean",
			Variants:       []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			Targetings:     schema.Targetings{schema.NewBasicTargeting("Eighteen percent", rule, "on")},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.credits_rule",
		}, fiber.StatusCreated)

		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/ofrep/v1/evaluate/flags/credits-rule",
			map[string]any{"context": ofrep.Context{"targetingKey": customerSlug}}), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		assert.Equal(t, "on", commonfixture.AssertJSONResponse[ofrep.EvaluationSuccess](t, resp, fiber.StatusOK).Variant)
	})
}

// A reader sums the source rows it would show itself: a credit pool the facts
// hide while AI is off counts as not granted, as it does in every reader that
// hides it.
func TestTargetingFacts_ACreditPoolThatIsHiddenCountsAsNotGranted(t *testing.T) {
	aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
	t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	customerSlug, _ := creditsWorld(t, aiServer, true)
	read := func(policy aiusage.Policy) []customertargetingfacts.TargetingFact {
		t.Helper()
		ctx := policy.Resolve(t.Context(), testDb.DefaultData.OrganizationID)
		facts, err := customertargetingfacts.New(testServer.Dependencies.DB, policy).GetTargetingFactsByCustomerSlug(ctx, testDb.DefaultData.OrganizationID, customerSlug)
		require.NoError(t, err)
		return facts
	}

	t.Run("WhenAIIsOn_ThePoolIsSummed", func(t *testing.T) {
		credits, found := factFor(t, read(aiusage.Policy{Flags: aitest.Flags(true)}), "credits")
		require.True(t, found)
		assert.Equal(t, limitAndUsage{limit: 1000, used: 180, events: 2}, credits)
	})

	t.Run("WhenAIIsOff_ItIsNotThere", func(t *testing.T) {
		facts := read(aiusage.Policy{})

		_, pool := factFor(t, facts, "scraped-pages")
		assert.False(t, pool, "the facts do not show the pool")
		credits, found := factFor(t, facts, "credits")
		require.True(t, found, "one source is enough")
		assert.Equal(t, limitAndUsage{limit: 400, used: 120, events: 1}, credits, "0.4 x 1000 and 0.4 x 300: the sum of what is shown")
	})
}
