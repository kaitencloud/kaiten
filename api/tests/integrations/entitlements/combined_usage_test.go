package entitlements_test

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// -- helpers --

func send(t *testing.T, app *fiber.App, method, path string, payload any) *http.Response {
	t.Helper()
	resp, err := app.Test(commonfixture.NewJSONRequest(t, method, path, payload), fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func post(t *testing.T, payload any) *http.Response {
	return send(t, testServer.App, "POST", "/api/entitlements", payload)
}

func put(t *testing.T, slug string, payload any) *http.Response {
	return send(t, testServer.App, "PUT", "/api/entitlements/"+slug, payload)
}

func problemOf(t *testing.T, resp *http.Response, status int) kaitenerrors.Problem {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, status)
}

func src(slug, weight string) schema.EntitlementSource {
	return schema.EntitlementSource{EntitlementSlug: slug, Weight: weight}
}

// newSource creates a NUMBER entitlement summed by SUM: lifetime, unless
// mutate says otherwise.
func newSource(t *testing.T, slug string, mutate ...func(*schema.Entitlement)) *schema.Entitlement {
	t.Helper()
	payload := schema.Entitlement{Name: slug, Slug: slug, Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum)}
	for _, m := range mutate {
		m(&payload)
	}
	return ptr.To(commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, payload), fiber.StatusCreated))
}

func monthly(anchor period.ResetAnchor) func(*schema.Entitlement) {
	return func(e *schema.Entitlement) { e.ResetPeriod, e.ResetAnchor = ptr.To(period.Month), ptr.To(anchor) }
}

func aggregatedBy(method schema.AggregationMethod) func(*schema.Entitlement) {
	return func(e *schema.Entitlement) { e.AggregationMethod = ptr.To(method) }
}

func combinedPayload(slug string, sources ...schema.EntitlementSource) schema.Entitlement {
	return schema.Entitlement{
		Name: "Combined " + slug, Slug: slug, Type: ptr.To(schema.Number),
		UsageSource: ptr.To(schema.CombinedUsage), Sources: sources,
	}
}

func newCombined(t *testing.T, slug string, sources ...schema.EntitlementSource) *schema.Entitlement {
	t.Helper()
	return ptr.To(commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, combinedPayload(slug, sources...)), fiber.StatusCreated))
}

// putBody is the full-replace PUT of an entitlement the way a client that read
// it sends it back: what it read, with the sources it names.
func putBody(entitlement *schema.Entitlement, sources ...schema.EntitlementSource) map[string]any {
	body := map[string]any{
		"name": entitlement.Name, "description": "", "usageSource": string(*entitlement.UsageSource),
		"aggregationMethod": string(*entitlement.AggregationMethod),
	}
	if sources != nil {
		body["sources"] = sources
	}
	if entitlement.ResetPeriod != nil {
		body["resetPeriod"], body["resetAnchor"] = string(*entitlement.ResetPeriod), string(*entitlement.ResetAnchor)
	}
	return body
}

func getEntitlement(t *testing.T, slug string) schema.Entitlement {
	t.Helper()
	resp := send(t, testServer.App, "GET", "/api/entitlements/"+slug, nil)
	return commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusOK)
}

func outboxEntitlement(t *testing.T, eventName, slug string) schema.Entitlement {
	t.Helper()
	var found *schema.Entitlement
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName != eventName {
			continue
		}
		var data schema.Entitlement
		require.NoError(t, json.Unmarshal(event.Data, &data))
		if data.Slug == slug {
			found = &data
		}
	}
	require.NotNil(t, found, "no %s event for %s", eventName, slug)
	return *found
}

func sourceSlugs(sources []schema.EntitlementSource) []string {
	slugs := make([]string, len(sources))
	for i, s := range sources {
		slugs[i] = s.EntitlementSlug + "=" + s.Weight
	}
	return slugs
}

// -- create --

func TestCreateCombinedEntitlement(t *testing.T) {
	t.Run("TheADRExample_SumsTwoSourcesAtTheirWeights", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "firecrawl-credits")
		newSource(t, "scraped-pages")
		payload := combinedPayload("credits", src("firecrawl-credits", "0.4"), src("scraped-pages", "0.6"))
		payload.UnitSingular, payload.UnitPlural, payload.UserFacing = ptr.To("credit"), ptr.To("credits"), ptr.To(true)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, payload), fiber.StatusCreated)

		require.Equal(t, schema.CombinedUsage, *created.UsageSource)
		require.Equal(t, schema.Number, *created.Type)
		require.Equal(t, schema.Sum, *created.AggregationMethod, "the API sets SUM when it is omitted")
		require.Equal(t, []string{"firecrawl-credits=0.4", "scraped-pages=0.6"}, sourceSlugs(created.Sources))
		require.Nil(t, created.ResetPeriod, "lifetime sources, a lifetime combined entitlement")
		require.Equal(t, "credit", *created.UnitSingular)
		require.True(t, *created.UserFacing)
		require.Equal(t, created, getEntitlement(t, "credits"), "the read answers what the create did")
	})

	t.Run("WeightsAreCanonicalAndOneWhenOmitted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newSource(t, "source-c")

		created := newCombined(t, "credits", src("source-a", "0.40"), src("source-b", ""), src("source-c", "007"))

		assert.Equal(t, []string{"source-a=0.4", "source-b=1", "source-c=7"}, sourceSlugs(created.Sources),
			"the weight reads as the exact decimal it is, with no zero it was not given")
	})

	t.Run("WeightsDoNotHaveToAddUpToOne", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")

		created := newCombined(t, "credits", src("source-a", "3"), src("source-b", "0.0000000001"))

		assert.Equal(t, []string{"source-a=3", "source-b=0.0000000001"}, sourceSlugs(created.Sources))
	})

	t.Run("TheCombinedEntitlementTakesTheWindowOfItsSources", func(t *testing.T) {
		for _, anchor := range []period.ResetAnchor{period.Calendar, period.LicenseStart, period.BillingPeriod} {
			t.Run(string(anchor), func(t *testing.T) {
				t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
				newSource(t, "source-a", monthly(anchor))
				newSource(t, "source-b", monthly(anchor))

				created := newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))

				require.Equal(t, period.Month, *created.ResetPeriod)
				require.Equal(t, anchor, *created.ResetAnchor)
			})
		}
	})

	t.Run("ACallerThatNamesTheSourcesWindowIsAccepted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a", monthly(period.Calendar))
		newSource(t, "source-b", monthly(period.Calendar))
		payload := combinedPayload("credits", src("source-a", "1"), src("source-b", "1"))
		payload.ResetPeriod, payload.ResetAnchor = ptr.To(period.Month), ptr.To(period.Calendar)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, payload), fiber.StatusCreated)

		require.Equal(t, period.Month, *created.ResetPeriod)
	})

	t.Run("ASourceMayFeedSeveralCombinedEntitlements", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newSource(t, "source-c")

		first := newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))
		second := newCombined(t, "units", src("source-a", "2"), src("source-c", "5"))

		assert.Equal(t, []string{"source-a=1", "source-b=1"}, sourceSlugs(first.Sources))
		assert.Equal(t, []string{"source-a=2", "source-c=5"}, sourceSlugs(second.Sources))
	})

	t.Run("TheCreatedEventCarriesTheSourcesAndTheirWeights", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newCombined(t, "credits", src("source-a", "0.4"), src("source-b", "0.6"))

		event := outboxEntitlement(t, entitlementEvents.EntitlementCreated.Name, "credits")

		assert.Equal(t, schema.CombinedUsage, *event.UsageSource)
		assert.Equal(t, []string{"source-a=0.4", "source-b=0.6"}, sourceSlugs(event.Sources))
	})

	t.Run("UsageSourceDefaultsToCalculatedForTheNumberFamilyAndIsAbsentForTheOthers", func(t *testing.T) {
		aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		create := func(payload schema.Entitlement) schema.Entitlement {
			resp := send(t, aiServer.App, "POST", "/api/entitlements", payload)
			return commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		}
		number := create(schema.Entitlement{Name: "Seats", Slug: "seats", Type: ptr.To(schema.Number)})
		pool := create(schema.Entitlement{Name: "Pool", Slug: "pool", Type: ptr.To(schema.NumberAICredit)})
		flag := create(schema.Entitlement{Name: "SSO", Slug: "sso", Type: ptr.To(schema.Boolean)})
		config := create(schema.Entitlement{Name: "Limits", Slug: "limits", Type: ptr.To(schema.Config)})

		assert.Equal(t, schema.CalculatedUsage, *number.UsageSource)
		assert.Equal(t, schema.CalculatedUsage, *pool.UsageSource)
		assert.Nil(t, flag.UsageSource)
		assert.Nil(t, config.UsageSource)
		for _, e := range []schema.Entitlement{number, pool, flag, config} {
			assert.Nil(t, e.Sources, "only a combined entitlement has sources")
		}

		listed := commonfixture.AssertJSONResponse[struct {
			Items []schema.Entitlement `json:"items"`
		}](t, send(t, aiServer.App, "GET", "/api/entitlements", nil), fiber.StatusOK)
		bySlug := map[string]schema.Entitlement{}
		for _, e := range listed.Items {
			bySlug[e.Slug] = e
		}
		assert.Equal(t, schema.CalculatedUsage, *bySlug["seats"].UsageSource)
		assert.Nil(t, bySlug["sso"].UsageSource, "the stored default of a BOOLEAN is never exposed")
	})

	t.Run("AnExplicitCalculatedUsageSourceIsTheDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		created := newSource(t, "seats", func(e *schema.Entitlement) { e.UsageSource = ptr.To(schema.CalculatedUsage) })
		assert.Equal(t, schema.CalculatedUsage, *created.UsageSource)
	})

	t.Run("SourcesAreListedWithTheEntitlementsOfAPage", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newCombined(t, "credits", src("source-a", "0.4"), src("source-b", "0.6"))

		listed := commonfixture.AssertJSONResponse[struct {
			Items []schema.Entitlement `json:"items"`
		}](t, send(t, testServer.App, "GET", "/api/entitlements", nil), fiber.StatusOK)

		bySlug := map[string]schema.Entitlement{}
		for _, e := range listed.Items {
			bySlug[e.Slug] = e
		}
		assert.Equal(t, []string{"source-a=0.4", "source-b=0.6"}, sourceSlugs(bySlug["credits"].Sources))
		assert.Empty(t, bySlug["source-a"].Sources)
	})
}

// A credit pool is a source like any NUMBER: it is the case the ADR starts from.
func TestCreateCombinedEntitlement_ACreditPoolIsASource(t *testing.T) {
	t.Run("WhenAIIsOn_ThePoolIsSummed", func(t *testing.T) {
		aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		create := func(payload schema.Entitlement) schema.Entitlement {
			return commonfixture.AssertJSONResponse[schema.Entitlement](t, send(t, aiServer.App, "POST", "/api/entitlements", payload), fiber.StatusCreated)
		}
		create(schema.Entitlement{Name: "Firecrawl", Slug: "firecrawl-credits", Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum)})
		create(schema.Entitlement{Name: "AI", Slug: "ai-credits", Type: ptr.To(schema.NumberAICredit), AggregationMethod: ptr.To(schema.Sum)})

		created := create(combinedPayload("credits", src("firecrawl-credits", "0.4"), src("ai-credits", "0.6")))

		assert.Equal(t, []string{"ai-credits=0.6", "firecrawl-credits=0.4"}, sourceSlugs(created.Sources))
	})

	t.Run("WhenAIIsOff_TheCreationIsRefusedWithTheUsualAnswer", func(t *testing.T) {
		aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, payload := range []schema.Entitlement{
			{Name: "Firecrawl", Slug: "firecrawl-credits", Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum)},
			{Name: "AI", Slug: "ai-credits", Type: ptr.To(schema.NumberAICredit), AggregationMethod: ptr.To(schema.Sum)},
		} {
			commonfixture.AssertJSONResponse[schema.Entitlement](t, send(t, aiServer.App, "POST", "/api/entitlements", payload), fiber.StatusCreated)
		}

		refused := problemOf(t, post(t, combinedPayload("credits", src("firecrawl-credits", "0.4"), src("ai-credits", "0.6"))), fiber.StatusForbidden)

		assert.Equal(t, "AIUsage.Disabled", refused.Code)
	})

	t.Run("AComputedEntitlementIsNeverACreditPool", func(t *testing.T) {
		aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, slug := range []string{"source-a", "source-b"} {
			commonfixture.AssertJSONResponse[schema.Entitlement](t, send(t, aiServer.App, "POST", "/api/entitlements",
				schema.Entitlement{Name: slug, Slug: slug, Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum)}), fiber.StatusCreated)
		}
		payload := combinedPayload("pool", src("source-a", "1"), src("source-b", "1"))
		payload.Type = ptr.To(schema.NumberAICredit)

		refused := problemOf(t, send(t, aiServer.App, "POST", "/api/entitlements", payload), fiber.StatusBadRequest)

		assert.Equal(t, "CreateEntitlement.InvalidUsageSourceConfiguration", refused.Code)
	})
}

// A credit pool a combined entitlement already sums is not new AI activity: while AI is off the
// entitlement stays editable, which the console needs, since every edit of it names its sources
// again. Adding a pool, or changing what one counts for, still asks for AI, as the vouchers'
// grants do: an exact echo is preserved, a change is refused.
func TestUpdateCombinedEntitlement_WhenAIIsOff(t *testing.T) {
	aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
	t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	create := func(payload schema.Entitlement) schema.Entitlement {
		return commonfixture.AssertJSONResponse[schema.Entitlement](t, send(t, aiServer.App, "POST", "/api/entitlements", payload), fiber.StatusCreated)
	}
	create(schema.Entitlement{Name: "Firecrawl", Slug: "firecrawl-credits", Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum)})
	create(schema.Entitlement{Name: "Pages", Slug: "scraped-pages", Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum)})
	create(schema.Entitlement{Name: "AI", Slug: "ai-credits", Type: ptr.To(schema.NumberAICredit), AggregationMethod: ptr.To(schema.Sum)})
	credits := create(combinedPayload("credits", src("firecrawl-credits", "0.4"), src("ai-credits", "0.6")))
	pages := create(combinedPayload("pages", src("firecrawl-credits", "1"), src("scraped-pages", "1")))

	t.Run("ARenameThatEchoesTheSourcesIsAccepted", func(t *testing.T) {
		body := putBody(&credits, credits.Sources...)
		body["name"], body["userFacing"] = "Renamed", true

		require.Equal(t, fiber.StatusNoContent, put(t, "credits", body).StatusCode)

		renamed := getEntitlement(t, "credits")
		assert.Equal(t, "Renamed", renamed.Name)
		assert.Equal(t, []string{"ai-credits=0.6", "firecrawl-credits=0.4"}, sourceSlugs(renamed.Sources))
	})

	t.Run("AnEchoWrittenOtherwiseIsTheSameWeight", func(t *testing.T) {
		body := putBody(&credits, src("ai-credits", "0.60"), src("firecrawl-credits", "0.4"))

		require.Equal(t, fiber.StatusNoContent, put(t, "credits", body).StatusCode)
	})

	t.Run("AnotherSourcesWeightIsStillAnEdit", func(t *testing.T) {
		body := putBody(&credits, src("ai-credits", "0.6"), src("firecrawl-credits", "0.5"))

		require.Equal(t, fiber.StatusNoContent, put(t, "credits", body).StatusCode)

		assert.Equal(t, []string{"ai-credits=0.6", "firecrawl-credits=0.5"}, sourceSlugs(getEntitlement(t, "credits").Sources))
	})

	t.Run("APoolItDidNotSumIsRefusedWithTheUsualAnswer", func(t *testing.T) {
		refused := problemOf(t, put(t, "pages", putBody(&pages, src("ai-credits", "1"), src("firecrawl-credits", "1"))), fiber.StatusForbidden)

		assert.Equal(t, "AIUsage.Disabled", refused.Code)
		assert.Equal(t, []string{"firecrawl-credits=1", "scraped-pages=1"}, sourceSlugs(getEntitlement(t, "pages").Sources), "nothing was written")
	})

	t.Run("WhatThePoolCountsForIsNotChangedWithoutAI", func(t *testing.T) {
		refused := problemOf(t, put(t, "credits", putBody(&credits, src("ai-credits", "0.7"), src("firecrawl-credits", "0.5"))), fiber.StatusForbidden)

		assert.Equal(t, "AIUsage.Disabled", refused.Code)
		assert.Equal(t, []string{"ai-credits=0.6", "firecrawl-credits=0.5"}, sourceSlugs(getEntitlement(t, "credits").Sources), "nothing was written")
	})
}

func TestCreateCombinedEntitlement_Refusals(t *testing.T) {
	create := func(t *testing.T, payload schema.Entitlement, status int) kaitenerrors.Problem {
		t.Helper()
		return problemOf(t, post(t, payload), status)
	}

	t.Run("AUsageSourceOnATypeThatCarriesNone_Is400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, kind := range []schema.Type{schema.Boolean, schema.Config} {
			for _, source := range []schema.UsageSource{schema.CalculatedUsage, schema.CombinedUsage} {
				refused := create(t, schema.Entitlement{Name: "x", Type: ptr.To(kind), UsageSource: ptr.To(source)}, fiber.StatusBadRequest)
				assert.Equal(t, "CreateEntitlement.InvalidUsageSourceConfiguration", refused.Code, "%s %s", kind, source)
			}
		}
	})

	t.Run("AggregationOtherThanSum_Is422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		payload := combinedPayload("credits", src("source-a", "1"), src("source-b", "1"))
		payload.AggregationMethod = ptr.To(schema.Count)

		assert.Equal(t, "CreateEntitlement.CombinedAggregationMustBeSum", create(t, payload, fiber.StatusUnprocessableEntity).Code)

		payload.AggregationMethod = ptr.To(schema.Sum)
		commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, payload), fiber.StatusCreated)
	})

	t.Run("AWarningThreshold_Is422AndZeroIsAccepted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		payload := combinedPayload("credits", src("source-a", "1"), src("source-b", "1"))
		payload.WarningThresholdPercent = ptr.To(int32(80))

		assert.Equal(t, "CreateEntitlement.CombinedWarningThreshold", create(t, payload, fiber.StatusUnprocessableEntity).Code)

		payload.WarningThresholdPercent = ptr.To(int32(0))
		commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, payload), fiber.StatusCreated)
	})

	t.Run("TheSources_Are422WithTheirOwnReason", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		for name, tt := range map[string]struct {
			sources []schema.EntitlementSource
			code    string
		}{
			"none":          {nil, "CreateEntitlement.CombinedSourcesRequired"},
			"one":           {[]schema.EntitlementSource{src("source-a", "1")}, "CreateEntitlement.CombinedSourcesRequired"},
			"a duplicate":   {[]schema.EntitlementSource{src("source-a", "1"), src("source-a", "2")}, "CreateEntitlement.CombinedSourceDuplicate"},
			"a zero weight": {[]schema.EntitlementSource{src("source-a", "0"), src("source-b", "1")}, "CreateEntitlement.CombinedSourceWeightInvalid"},
			"0.0":           {[]schema.EntitlementSource{src("source-a", "0.0"), src("source-b", "1")}, "CreateEntitlement.CombinedSourceWeightInvalid"},
		} {
			t.Run(name, func(t *testing.T) {
				refused := create(t, combinedPayload("credits", tt.sources...), fiber.StatusUnprocessableEntity)
				assert.Equal(t, tt.code, refused.Code)
			})
		}

		t.Run("a weight that is no decimal never reaches the use case", func(t *testing.T) {
			resp := post(t, combinedPayload("credits", src("source-a", "abc"), src("source-b", "1")))
			require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode, "the contract's pattern refuses it first")
		})
	})

	t.Run("SourcesOnACalculatedEntitlement_Are422ButNoneIsFine", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		payload := schema.Entitlement{
			Name: "Seats", Slug: "seats", Type: ptr.To(schema.Number), Sources: []schema.EntitlementSource{src("source-a", "1"), src("source-b", "1")},
		}

		assert.Equal(t, "CreateEntitlement.SourcesNotAllowed", create(t, payload, fiber.StatusUnprocessableEntity).Code)

		payload.UsageSource = ptr.To(schema.CalculatedUsage)
		assert.Equal(t, "CreateEntitlement.SourcesNotAllowed", create(t, payload, fiber.StatusUnprocessableEntity).Code)

		boolean := schema.Entitlement{Name: "SSO", Type: ptr.To(schema.Boolean), Sources: []schema.EntitlementSource{src("source-a", "1")}}
		assert.Equal(t, "CreateEntitlement.SourcesNotAllowed", create(t, boolean, fiber.StatusUnprocessableEntity).Code)

		// Absent, null and empty are not sources: a client that serializes the
		// field does not name one.
		for name, body := range map[string]string{
			"empty": `{"name":"Empty","description":"x","type":"NUMBER","sources":[]}`,
			"null":  `{"name":"Null","description":"x","type":"NUMBER","sources":null}`,
		} {
			t.Run(name, func(t *testing.T) {
				req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", json.RawMessage(body))
				resp, err := testServer.App.Test(req, fiber.TestConfig{})
				require.NoError(t, err)
				t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
				created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
				assert.Equal(t, schema.CalculatedUsage, *created.UsageSource)
				assert.Empty(t, created.Sources)
			})
		}
	})

	t.Run("ASourceTheOrganizationDoesNotHave_Is404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")

		refused := create(t, combinedPayload("credits", src("source-a", "1"), src("no-such-source", "1")), fiber.StatusNotFound)

		assert.Equal(t, "CreateEntitlement.SourceNotFound", refused.Code)
		assert.Contains(t, refused.Detail, "no-such-source")
	})

	t.Run("ASourceOfAnotherOrganization_Is404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		neighbour := uuid.New()
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Neighbour')`, neighbour, "neighbour-"+neighbour.String())
		require.NoError(t, err)
		_, err = testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method)
			VALUES ($1, 'Theirs', 'theirs', 'NUMBER', 'SUM')`, neighbour)
		require.NoError(t, err)

		refused := create(t, combinedPayload("credits", src("source-a", "1"), src("theirs", "1")), fiber.StatusNotFound)

		assert.Equal(t, "CreateEntitlement.SourceNotFound", refused.Code)
	})

	t.Run("ACombinedSource_NoSumOfSums_Is422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newSource(t, "source-c")
		newCombined(t, "inner", src("source-a", "1"), src("source-b", "1"))

		refused := create(t, combinedPayload("outer", src("inner", "1"), src("source-c", "1")), fiber.StatusUnprocessableEntity)

		assert.Equal(t, "CreateEntitlement.SourceIsCombined", refused.Code)
	})

	t.Run("ASourceThatIsNotANumber_Is422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		for _, kind := range []schema.Type{schema.Boolean, schema.Config} {
			slug := "flag-" + strings.ToLower(string(kind))
			commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, schema.Entitlement{Name: slug, Slug: slug, Type: ptr.To(kind)}), fiber.StatusCreated)

			refused := create(t, combinedPayload("credits", src("source-a", "1"), src(slug, "1")), fiber.StatusUnprocessableEntity)

			assert.Equal(t, "CreateEntitlement.SourceUnsupportedType", refused.Code, kind)
		}
	})

	t.Run("ASourceThatIsNotSummedByAddition_Is422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		for _, method := range []schema.AggregationMethod{schema.Average, schema.Max, schema.Min, schema.Latest} {
			slug := "by-" + strings.ToLower(string(method))
			newSource(t, slug, aggregatedBy(method))

			refused := create(t, combinedPayload("credits", src("source-a", "1"), src(slug, "1")), fiber.StatusUnprocessableEntity)

			assert.Equal(t, "CreateEntitlement.SourceUnsupportedAggregation", refused.Code, method)
		}
	})

	t.Run("ACountIsASource", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "events", aggregatedBy(schema.Count))

		created := newCombined(t, "credits", src("source-a", "1"), src("events", "1"))

		assert.Len(t, created.Sources, 2)
	})

	t.Run("SourcesOnAnotherWindow_Are422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "lifetime")
		newSource(t, "calendar-month", monthly(period.Calendar))
		newSource(t, "license-month", monthly(period.LicenseStart))
		newSource(t, "calendar-week", func(e *schema.Entitlement) {
			e.ResetPeriod, e.ResetAnchor = ptr.To(period.Week), ptr.To(period.Calendar)
		})

		for name, pair := range map[string][2]string{
			"lifetime and periodic": {"lifetime", "calendar-month"},
			"periodic and lifetime": {"calendar-month", "lifetime"},
			"another anchor":        {"calendar-month", "license-month"},
			"another period":        {"calendar-month", "calendar-week"},
		} {
			t.Run(name, func(t *testing.T) {
				refused := create(t, combinedPayload("credits", src(pair[0], "1"), src(pair[1], "1")), fiber.StatusUnprocessableEntity)
				assert.Equal(t, "CreateEntitlement.SourceWindowMismatch", refused.Code)
			})
		}
	})

	t.Run("AWindowThatIsNotTheSourcesIs422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a", monthly(period.Calendar))
		newSource(t, "source-b", monthly(period.Calendar))
		newSource(t, "lifetime-a")
		newSource(t, "lifetime-b")

		another := combinedPayload("credits", src("source-a", "1"), src("source-b", "1"))
		another.ResetPeriod, another.ResetAnchor = ptr.To(period.Week), ptr.To(period.Calendar)
		assert.Equal(t, "CreateEntitlement.CombinedWindowMismatch", create(t, another, fiber.StatusUnprocessableEntity).Code)

		onLifetime := combinedPayload("lifetime", src("lifetime-a", "1"), src("lifetime-b", "1"))
		onLifetime.ResetPeriod, onLifetime.ResetAnchor = ptr.To(period.Month), ptr.To(period.Calendar)
		assert.Equal(t, "CreateEntitlement.CombinedWindowMismatch", create(t, onLifetime, fiber.StatusUnprocessableEntity).Code)

		assert.Equal(t, 0, countCombined(t), "a refused creation leaves no combined entitlement behind")
	})
}

func countCombined(t *testing.T) int {
	t.Helper()
	var n int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM entitlement WHERE usage_source = 'COMBINED_USAGE'`).Scan(&n))
	return n
}

// -- update --

func TestUpdateCombinedEntitlement(t *testing.T) {
	t.Run("TheSourcesAndWeightsAreReplacedAsAWhole", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, slug := range []string{"source-a", "source-b", "source-c"} {
			newSource(t, slug)
		}
		combined := newCombined(t, "credits", src("source-a", "0.4"), src("source-b", "0.6"))

		resp := put(t, "credits", putBody(combined, src("source-b", "2"), src("source-c", "0.5")))

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		assert.Equal(t, []string{"source-b=2", "source-c=0.5"}, sourceSlugs(getEntitlement(t, "credits").Sources))
		event := outboxEntitlement(t, entitlementEvents.EntitlementUpdated.Name, "credits")
		assert.Equal(t, []string{"source-b=2", "source-c=0.5"}, sourceSlugs(event.Sources), "ENTITLEMENT_UPDATED records the change")
	})

	t.Run("AWeightEditIsAnEdit", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		combined := newCombined(t, "credits", src("source-a", "0.4"), src("source-b", "0.6"))

		require.Equal(t, fiber.StatusNoContent, put(t, "credits", putBody(combined, src("source-a", "0.5"), src("source-b", "0.6"))).StatusCode)

		assert.Equal(t, []string{"source-a=0.5", "source-b=0.6"}, sourceSlugs(getEntitlement(t, "credits").Sources))
	})

	t.Run("ARenameThatEchoesTheSourcesKeepsThem", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		combined := newCombined(t, "credits", src("source-a", "0.4"), src("source-b", "0.6"))
		body := putBody(combined, combined.Sources...)
		body["name"] = "Renamed"
		body["userFacing"] = true

		require.Equal(t, fiber.StatusNoContent, put(t, "credits", body).StatusCode)

		renamed := getEntitlement(t, "credits")
		assert.Equal(t, "Renamed", renamed.Name)
		assert.True(t, *renamed.UserFacing)
		assert.Equal(t, []string{"source-a=0.4", "source-b=0.6"}, sourceSlugs(renamed.Sources))
	})

	t.Run("APutWithoutTheSources_Is422AndKeepsThem", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		combined := newCombined(t, "credits", src("source-a", "0.4"), src("source-b", "0.6"))

		for name, sources := range map[string][]schema.EntitlementSource{
			"absent": nil, "empty": {}, "one": {src("source-a", "1")},
		} {
			t.Run(name, func(t *testing.T) {
				refused := problemOf(t, put(t, "credits", putBody(combined, sources...)), fiber.StatusUnprocessableEntity)
				assert.Equal(t, "UpdateEntitlement.CombinedSourcesRequired", refused.Code)
			})
		}
		assert.Equal(t, []string{"source-a=0.4", "source-b=0.6"}, sourceSlugs(getEntitlement(t, "credits").Sources))
	})

	t.Run("TheSourcesAreCheckedAsOnCreate", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newSource(t, "average", aggregatedBy(schema.Average))
		newSource(t, "monthly", monthly(period.Calendar))
		newCombined(t, "other", src("source-a", "1"), src("source-b", "1"))
		combined := newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))

		for name, tt := range map[string]struct {
			sources []schema.EntitlementSource
			status  int
			code    string
		}{
			"unknown":             {[]schema.EntitlementSource{src("source-a", "1"), src("no-such-source", "1")}, fiber.StatusNotFound, "UpdateEntitlement.SourceNotFound"},
			"combined":            {[]schema.EntitlementSource{src("source-a", "1"), src("other", "1")}, fiber.StatusUnprocessableEntity, "UpdateEntitlement.SourceIsCombined"},
			"an average":          {[]schema.EntitlementSource{src("source-a", "1"), src("average", "1")}, fiber.StatusUnprocessableEntity, "UpdateEntitlement.SourceUnsupportedAggregation"},
			"another window":      {[]schema.EntitlementSource{src("source-a", "1"), src("monthly", "1")}, fiber.StatusUnprocessableEntity, "UpdateEntitlement.SourceWindowMismatch"},
			"a duplicate":         {[]schema.EntitlementSource{src("source-a", "1"), src("source-a", "2")}, fiber.StatusUnprocessableEntity, "UpdateEntitlement.CombinedSourceDuplicate"},
			"a weight of zero":    {[]schema.EntitlementSource{src("source-a", "0"), src("source-b", "1")}, fiber.StatusUnprocessableEntity, "UpdateEntitlement.CombinedSourceWeightInvalid"},
			"the entitlement too": {[]schema.EntitlementSource{src("source-a", "1"), src("credits", "1")}, fiber.StatusUnprocessableEntity, "UpdateEntitlement.SourceIsCombined"},
		} {
			t.Run(name, func(t *testing.T) {
				refused := problemOf(t, put(t, "credits", putBody(combined, tt.sources...)), tt.status)
				assert.Equal(t, tt.code, refused.Code)
			})
		}
	})

	t.Run("UsageSourceIsImmutable", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		combined := newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))
		calculated := newSource(t, "seats")

		toCalculated := putBody(combined, combined.Sources...)
		toCalculated["usageSource"] = "CALCULATED_USAGE"
		assert.Equal(t, "UpdateEntitlement.ImmutableUsageSource", problemOf(t, put(t, "credits", toCalculated), fiber.StatusBadRequest).Code)

		toCombined := putBody(calculated, combined.Sources...)
		toCombined["usageSource"] = "COMBINED_USAGE"
		assert.Equal(t, "UpdateEntitlement.ImmutableUsageSource", problemOf(t, put(t, "seats", toCombined), fiber.StatusBadRequest).Code)

		omitted := putBody(combined, combined.Sources...)
		delete(omitted, "usageSource")
		assert.Equal(t, fiber.StatusNoContent, put(t, "credits", omitted).StatusCode, "an omitted usageSource is accepted, as an omitted type is")

		// An entitlement that has no usage has no source to name, even the default.
		flag := commonfixture.AssertJSONResponse[schema.Entitlement](t, post(t, schema.Entitlement{Name: "SSO", Slug: "sso", Type: ptr.To(schema.Boolean)}), fiber.StatusCreated)
		named := map[string]any{"name": flag.Name, "description": "", "usageSource": "CALCULATED_USAGE"}
		assert.Equal(t, "UpdateEntitlement.ImmutableUsageSource", problemOf(t, put(t, "sso", named), fiber.StatusBadRequest).Code)
		delete(named, "usageSource")
		assert.Equal(t, fiber.StatusNoContent, put(t, "sso", named).StatusCode)
	})

	t.Run("AWarningThreshold_Is422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		combined := newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))
		body := putBody(combined, combined.Sources...)
		body["warningThresholdPercent"] = 80

		assert.Equal(t, "UpdateEntitlement.CombinedWarningThreshold", problemOf(t, put(t, "credits", body), fiber.StatusUnprocessableEntity).Code)

		body["warningThresholdPercent"] = 0
		assert.Equal(t, fiber.StatusNoContent, put(t, "credits", body).StatusCode)
	})

	t.Run("SourcesOnACalculatedEntitlement_Are422ButNoneIsFine", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		seats := newSource(t, "seats")

		named := putBody(seats, src("source-a", "1"), src("source-b", "1"))
		assert.Equal(t, "UpdateEntitlement.SourcesNotAllowed", problemOf(t, put(t, "seats", named), fiber.StatusUnprocessableEntity).Code)

		for name, sources := range map[string]any{"empty": []schema.EntitlementSource{}, "null": nil, "absent": "absent"} {
			t.Run(name, func(t *testing.T) {
				body := putBody(seats)
				if sources != "absent" {
					body["sources"] = sources
				}
				assert.Equal(t, fiber.StatusNoContent, put(t, "seats", body).StatusCode)
			})
		}
	})

	// A combined entitlement stores no counter, so nothing is orphaned when its
	// sources move to another window: it takes the new one. The one-way door of
	// a calculated entitlement does not apply to it.
	t.Run("TheWindowFollowsTheSources", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "lifetime-a")
		newSource(t, "lifetime-b")
		newSource(t, "calendar-a", monthly(period.Calendar))
		newSource(t, "calendar-b", monthly(period.Calendar))
		newSource(t, "start-a", monthly(period.LicenseStart))
		newSource(t, "start-b", monthly(period.LicenseStart))
		combined := newCombined(t, "credits", src("lifetime-a", "1"), src("lifetime-b", "1"))
		require.Nil(t, combined.ResetPeriod)

		// Lifetime to monthly, the sender naming no window.
		require.Equal(t, fiber.StatusNoContent, put(t, "credits", putBody(combined, src("calendar-a", "1"), src("calendar-b", "1"))).StatusCode)
		moved := getEntitlement(t, "credits")
		require.Equal(t, period.Month, *moved.ResetPeriod)
		require.Equal(t, period.Calendar, *moved.ResetAnchor)

		// Another anchor, the sender echoing the window it read: refused with the
		// window the new sources give, and nothing is changed.
		stale := putBody(&moved, src("start-a", "1"), src("start-b", "1"))
		refused := problemOf(t, put(t, "credits", stale), fiber.StatusUnprocessableEntity)
		assert.Equal(t, "UpdateEntitlement.CombinedWindowMismatch", refused.Code)
		assert.Contains(t, refused.Detail, "LICENSE_START")
		assert.Equal(t, period.Calendar, *getEntitlement(t, "credits").ResetAnchor, "a refused PUT changes nothing")
		assert.Equal(t, []string{"calendar-a=1", "calendar-b=1"}, sourceSlugs(getEntitlement(t, "credits").Sources))

		// The sources still have to share one window.
		mixed := putBody(&moved, src("calendar-a", "1"), src("start-a", "1"))
		delete(mixed, "resetPeriod")
		delete(mixed, "resetAnchor")
		assert.Equal(t, "UpdateEntitlement.SourceWindowMismatch", problemOf(t, put(t, "credits", mixed), fiber.StatusUnprocessableEntity).Code)

		// The sender naming the window the new sources share.
		fresh := putBody(&moved, src("start-a", "1"), src("start-b", "1"))
		fresh["resetAnchor"] = "LICENSE_START"
		require.Equal(t, fiber.StatusNoContent, put(t, "credits", fresh).StatusCode)
		assert.Equal(t, period.LicenseStart, *getEntitlement(t, "credits").ResetAnchor)

		// Back to lifetime.
		back := putBody(&moved, src("lifetime-a", "1"), src("lifetime-b", "1"))
		delete(back, "resetPeriod")
		delete(back, "resetAnchor")
		require.Equal(t, fiber.StatusNoContent, put(t, "credits", back).StatusCode)
		assert.Nil(t, getEntitlement(t, "credits").ResetPeriod)
		assert.Nil(t, getEntitlement(t, "credits").ResetAnchor)
	})

	t.Run("AnEntitlementThatIsASourceCannotAdoptAResetPeriod", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		source := newSource(t, "source-a")
		newSource(t, "source-b")
		newSource(t, "source-c")
		combined := newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))
		adopt := func(slug string, e *schema.Entitlement) *http.Response {
			body := putBody(e)
			body["resetPeriod"], body["resetAnchor"] = "MONTH", "CALENDAR"
			return put(t, slug, body)
		}

		refused := problemOf(t, adopt("source-a", source), fiber.StatusUnprocessableEntity)
		assert.Equal(t, "UpdateEntitlement.SourceWindowLocked", refused.Code)
		assert.Contains(t, refused.Detail, "credits", "it names the combined entitlement")

		// Not a source, not locked.
		assert.Equal(t, fiber.StatusNoContent, adopt("source-c", getEntitlementPtr(t, "source-c")).StatusCode)

		// Once it is no longer a source it can.
		third := newSource(t, "source-d")
		require.Equal(t, fiber.StatusNoContent, put(t, "credits", putBody(combined, src("source-b", "1"), src("source-d", "1"))).StatusCode)
		assert.Equal(t, fiber.StatusNoContent, adopt("source-a", source).StatusCode, "removed from the combined entitlement first")
		assert.Equal(t, "UpdateEntitlement.SourceWindowLocked", problemOf(t, adopt("source-d", third), fiber.StatusUnprocessableEntity).Code)
	})

	t.Run("AnEditThatLeavesTheWindowAloneIsNotRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		source := newSource(t, "source-a")
		newSource(t, "source-b")
		newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))
		body := putBody(source)
		body["name"] = "Renamed source"

		assert.Equal(t, fiber.StatusNoContent, put(t, "source-a", body).StatusCode, "a source is edited like any entitlement")
	})
}

func getEntitlementPtr(t *testing.T, slug string) *schema.Entitlement {
	t.Helper()
	e := getEntitlement(t, slug)
	return &e
}

// -- delete --

func TestDeleteCombinedEntitlement(t *testing.T) {
	t.Run("ASourceInUseIs409AndNamesTheCombinedEntitlement", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))
		newCombined(t, "units", src("source-a", "2"), src("source-b", "2"))

		resp := send(t, testServer.App, "DELETE", "/api/entitlements/source-a", nil)

		refused := problemOf(t, resp, fiber.StatusConflict)
		assert.Equal(t, "DeleteEntitlement.InUseConflict", refused.Code)
		assert.Contains(t, refused.Detail, "credits")
		assert.Contains(t, refused.Detail, "units")
		require.NotEmpty(t, refused.Errors)
		counts, ok := refused.Errors[0].Value.(map[string]any)
		require.True(t, ok)
		assert.EqualValues(t, 2, counts["combinedEntitlements"], "the console lists what holds it, counted")
		assert.EqualValues(t, 0, counts["licenseGrants"])
		assert.Equal(t, "source-a", getEntitlement(t, "source-a").Slug, "a refused delete leaves it in place")
	})

	t.Run("TheCombinedEntitlementIsDeletedWithItsLinks", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSource(t, "source-a")
		newSource(t, "source-b")
		newCombined(t, "credits", src("source-a", "0.4"), src("source-b", "0.6"))

		resp := send(t, testServer.App, "DELETE", "/api/entitlements/credits", nil)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		var links int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM entitlement_source`).Scan(&links))
		assert.Zero(t, links)
		event := outboxEntitlement(t, entitlementEvents.EntitlementDeleted.Name, "credits")
		assert.Equal(t, []string{"source-a=0.4", "source-b=0.6"}, sourceSlugs(event.Sources), "the event still says what it summed")

		// What it summed is free again.
		assert.Equal(t, fiber.StatusNoContent, send(t, testServer.App, "DELETE", "/api/entitlements/source-a", nil).StatusCode)
	})

	t.Run("ASourceOfASingleCombinedEntitlementIsFreedByRemovingItFromIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		source := newSource(t, "source-a")
		newSource(t, "source-b")
		newSource(t, "source-c")
		combined := newCombined(t, "credits", src("source-a", "1"), src("source-b", "1"))
		require.Equal(t, fiber.StatusNoContent, put(t, "credits", putBody(combined, src("source-b", "1"), src("source-c", "1"))).StatusCode)

		resp := send(t, testServer.App, "DELETE", "/api/entitlements/"+source.Slug, nil)

		assert.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	})
}

// -- races --

// run starts the operations together and answers what each returned.
func run(t *testing.T, operations ...func() *http.Response) []*http.Response {
	t.Helper()
	responses := make([]*http.Response, len(operations))
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, operation := range operations {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			responses[i] = operation()
		}()
	}
	close(start)
	wg.Wait()
	for _, resp := range responses {
		require.NotNil(t, resp)
		t.Cleanup(func() { _ = resp.Body.Close() })
	}
	return responses
}

func asRequest(t *testing.T, method, path string, payload any) func() *http.Response {
	req := commonfixture.NewJSONRequest(t, method, path, payload)
	return func() *http.Response {
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		if err != nil {
			return nil
		}
		return resp
	}
}

func codeOf(t *testing.T, resp *http.Response) string {
	t.Helper()
	var problem kaitenerrors.Problem
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&problem))
	return problem.Code
}

// TestCombinedEntitlement_WritesRaceTheirSources: the checks that make a
// combined entitlement valid are made under row locks, so a concurrent change of
// a source either comes first and is seen, or comes after and is refused. What
// never happens is both succeeding.
func TestCombinedEntitlement_WritesRaceTheirSources(t *testing.T) {
	const rounds = 12

	t.Run("DeletingASourceWhileACombinedEntitlementIsCreatedOnIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		created, deleted := 0, 0
		for round := range rounds {
			n := strconv.Itoa(round)
			newSource(t, "doomed-"+n)
			newSource(t, "stays-"+n)
			payload := combinedPayload("credits-"+n, src("doomed-"+n, "1"), src("stays-"+n, "1"))

			responses := run(t,
				asRequest(t, "POST", "/api/entitlements", payload),
				asRequest(t, "DELETE", "/api/entitlements/doomed-"+n, nil),
			)

			switch create, del := responses[0], responses[1]; {
			case create.StatusCode == fiber.StatusCreated && del.StatusCode == fiber.StatusConflict:
				created++
				assert.Equal(t, "DeleteEntitlement.InUseConflict", codeOf(t, del))
			case create.StatusCode == fiber.StatusNotFound && del.StatusCode == fiber.StatusNoContent:
				deleted++
				assert.Equal(t, "CreateEntitlement.SourceNotFound", codeOf(t, create))
			default:
				t.Fatalf("round %d: create answered %d and delete %d: a combined entitlement and the deletion of its source were both accepted, or one failed on its own", round, create.StatusCode, del.StatusCode)
			}
		}
		var orphans int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM entitlement e
			WHERE e.usage_source = 'COMBINED_USAGE'
			  AND (SELECT count(*) FROM entitlement_source es WHERE es.combined_entitlement_id = e.id) < 2`).Scan(&orphans))
		assert.Zero(t, orphans, "no combined entitlement is left with fewer than the two sources it was made of (created %d, deleted %d)", created, deleted)
	})

	t.Run("DeletingASourceWhileACombinedEntitlementIsUpdatedToIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for round := range rounds {
			n := strconv.Itoa(round)
			newSource(t, "kept-a-"+n)
			newSource(t, "kept-b-"+n)
			newSource(t, "doomed-"+n)
			combined := newCombined(t, "credits-"+n, src("kept-a-"+n, "1"), src("kept-b-"+n, "1"))

			responses := run(t,
				asRequest(t, "PUT", "/api/entitlements/credits-"+n, putBody(combined, src("kept-a-"+n, "1"), src("doomed-"+n, "1"))),
				asRequest(t, "DELETE", "/api/entitlements/doomed-"+n, nil),
			)

			switch update, del := responses[0], responses[1]; {
			case update.StatusCode == fiber.StatusNoContent && del.StatusCode == fiber.StatusConflict:
			case update.StatusCode == fiber.StatusNotFound && del.StatusCode == fiber.StatusNoContent:
				assert.Equal(t, "UpdateEntitlement.SourceNotFound", codeOf(t, update))
			default:
				t.Fatalf("round %d: update answered %d and delete %d", round, update.StatusCode, del.StatusCode)
			}
		}
	})

	t.Run("AdoptingAResetPeriodWhileACombinedEntitlementIsCreatedOnTheSource", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for round := range rounds {
			n := strconv.Itoa(round)
			adopter := newSource(t, "adopter-"+n)
			newSource(t, "lifetime-"+n)
			adopt := putBody(adopter)
			adopt["resetPeriod"], adopt["resetAnchor"] = "MONTH", "CALENDAR"

			responses := run(t,
				asRequest(t, "POST", "/api/entitlements", combinedPayload("credits-"+n, src("adopter-"+n, "1"), src("lifetime-"+n, "1"))),
				asRequest(t, "PUT", "/api/entitlements/adopter-"+n, adopt),
			)

			switch create, update := responses[0], responses[1]; {
			case create.StatusCode == fiber.StatusCreated && update.StatusCode == fiber.StatusUnprocessableEntity:
				assert.Equal(t, "UpdateEntitlement.SourceWindowLocked", codeOf(t, update))
			case create.StatusCode == fiber.StatusUnprocessableEntity && update.StatusCode == fiber.StatusNoContent:
				assert.Equal(t, "CreateEntitlement.SourceWindowMismatch", codeOf(t, create))
			default:
				t.Fatalf("round %d: create answered %d and the adoption %d: the sources of a combined entitlement ended on two windows, or one failed on its own", round, create.StatusCode, update.StatusCode)
			}
		}
		var split int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM (
			SELECT es.combined_entitlement_id FROM entitlement_source es
			JOIN entitlement s ON s.id = es.source_entitlement_id
			GROUP BY es.combined_entitlement_id
			HAVING count(DISTINCT (s.reset_period, s.reset_anchor)) > 1) split`).Scan(&split))
		assert.Zero(t, split, "no combined entitlement sums sources on two windows")
	})
}
