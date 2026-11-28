package instances_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateinstance"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// A combined entitlement is the weighted sum of its sources' usage, computed
// when it is read (ADR "A combined entitlement"). Nothing is stored for it and
// nothing is enforced on it: these tests read it through every route that does.

func postEntitlement(t *testing.T, payload entitlementschema.Entitlement) entitlementschema.Entitlement {
	t.Helper()
	return sendInstanceRequest[entitlementschema.Entitlement](t, http.MethodPost, "/api/entitlements", payload, fiber.StatusCreated)
}

func newSourceEntitlement(t *testing.T, slug string, mutate ...func(*entitlementschema.Entitlement)) entitlementschema.Entitlement {
	t.Helper()
	payload := entitlementschema.Entitlement{Name: slug, Slug: slug, Type: ptr.To(entitlementschema.Number), AggregationMethod: ptr.To(entitlementschema.Sum)}
	for _, m := range mutate {
		m(&payload)
	}
	return postEntitlement(t, payload)
}

func calendarMonth(e *entitlementschema.Entitlement) {
	e.ResetPeriod, e.ResetAnchor = ptr.To(period.Month), ptr.To(period.Calendar)
}

func source(slug, weight string) entitlementschema.EntitlementSource {
	return entitlementschema.EntitlementSource{EntitlementSlug: slug, Weight: weight}
}

func newCombinedEntitlement(t *testing.T, slug string, sources ...entitlementschema.EntitlementSource) entitlementschema.Entitlement {
	t.Helper()
	return postEntitlement(t, entitlementschema.Entitlement{
		Name: slug, Slug: slug, Type: ptr.To(entitlementschema.Number),
		UsageSource: ptr.To(entitlementschema.CombinedUsage), Sources: sources,
	})
}

func appendUsage(t *testing.T, instanceSlug, entitlementSlug string, value float64) *http.Response {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"}), fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func mustReport(t *testing.T, instanceSlug, entitlementSlug string, value float64) {
	t.Helper()
	require.Equal(t, fiber.StatusOK, appendUsage(t, instanceSlug, entitlementSlug, value).StatusCode)
}

func singleRead(t *testing.T, instanceSlug, entitlementSlug string, wantStatus int) *http.Response {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", nil), fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	require.Equal(t, wantStatus, resp.StatusCode)
	return resp
}

// readsAs asserts a usage reads as used of limit.
func readsAs(t *testing.T, usage instanceschema.EntitlementUsage, used, limit float64) {
	t.Helper()
	require.NotNil(t, usage.Value.Number, "a NUMBER usage")
	require.NotNil(t, usage.Limit)
	require.NotNil(t, usage.Limit.Number)
	assert.InDelta(t, used, usage.Value.Number.Value, 1e-9, "usage of %s", usage.EntitlementSlug)
	assert.InDelta(t, limit, usage.Limit.Number.Value, 1e-9, "limit of %s", usage.EntitlementSlug)
}

// creditsWorld is the ADR's: two sources, 1000 granted on each, counted at 0.4 and 0.6.
type creditsWorld struct {
	credits  entitlementschema.Entitlement
	license  *licenseschema.License
	instance *instanceschema.Instance
}

func newCreditsWorld(t *testing.T) creditsWorld {
	t.Helper()
	newSourceEntitlement(t, "firecrawl-credits")
	newSourceEntitlement(t, "scraped-pages")
	credits := newCombinedEntitlement(t, "credits", source("firecrawl-credits", "0.4"), source("scraped-pages", "0.6"))
	license := newLicense(t)
	assignEntitlementToLicense(t, license.Slug, "firecrawl-credits", 1000)
	assignEntitlementToLicense(t, license.Slug, "scraped-pages", 1000)
	return creditsWorld{credits: credits, license: license, instance: newInstanceOn(t, license)}
}

func TestCombinedUsage_ReadsAsTheWeightedSumOfItsSources(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	world := newCreditsWorld(t)
	mustReport(t, world.instance.Slug, "firecrawl-credits", 300)
	mustReport(t, world.instance.Slug, "scraped-pages", 100)

	t.Run("TheListAppendsItAfterWhatIsGranted", func(t *testing.T) {
		list := sendInstanceRequest[[]instanceschema.EntitlementUsage](t, http.MethodGet, "/api/instances/"+world.instance.Slug+"/entitlements/usage", nil, fiber.StatusOK)

		require.Len(t, list, 3)
		assert.Equal(t, "credits", list[2].EntitlementSlug, "after the entitlements the licence grants")
		credits := list[2]
		readsAs(t, credits, 180, 1000)
		assert.EqualValues(t, 2, credits.Value.Number.EventCount, "the sum of the events of the sources")
		assert.EqualValues(t, 0, *credits.LimitCapExceededOveragePercent)
		assert.Equal(t, instanceschema.SourceLicense, credits.Source, "the closed enum of the response is not widened")
		assert.Nil(t, credits.Provenance)
		assert.Nil(t, credits.Reserved)
		assert.Equal(t, world.license.ID, credits.LicenseID)
		assert.Equal(t, world.license.Slug, credits.LicenseSlug)
		assert.Nil(t, credits.CurrentPeriodStart, "lifetime sources, a lifetime sum")
		assert.Equal(t, []instanceschema.CombinedSourceUsage{
			{EntitlementSlug: "firecrawl-credits", Weight: "0.4", Usage: 300, Limit: 1000},
			{EntitlementSlug: "scraped-pages", Weight: "0.6", Usage: 100, Limit: 1000},
		}, credits.Sources, "the organization's credential gets the detail: 120 of 400 and 60 of 600")

		bySlug := usagesOf(t, world.instance.Slug)
		readsAs(t, bySlug["firecrawl-credits"], 300, 1000)
		readsAs(t, bySlug["scraped-pages"], 100, 1000)
		assert.Empty(t, bySlug["firecrawl-credits"].Sources, "only a combined entitlement has a detail")
	})

	t.Run("TheSingleReadIsTheSameRow", func(t *testing.T) {
		resp := singleRead(t, world.instance.Slug, "credits", fiber.StatusOK)
		single := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, resp, fiber.StatusOK)

		readsAs(t, single, 180, 1000)
		assert.Equal(t, usagesOf(t, world.instance.Slug)["credits"], single, "one computation, answered the same by both")
	})

	t.Run("TheSingleReadIsAuditedLikeAnyOther", func(t *testing.T) {
		singleRead(t, world.instance.Slug, "credits", fiber.StatusOK)

		found := false
		for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
			var data map[string]any
			if event.EventName == "ENTITLEMENT_VALUE_GET" && json.Unmarshal(event.Data, &data) == nil && data["entitlement_slug"] == "credits" {
				found = true
			}
		}
		assert.True(t, found, "ENTITLEMENT_VALUE_GET names the combined entitlement")
	})

	t.Run("NothingIsStoredForIt", func(t *testing.T) {
		var rows int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT
			(SELECT count(*) FROM entitlement_usage eu JOIN entitlement e ON e.id = eu.entitlement_id WHERE e.slug = 'credits')
			+ (SELECT count(*) FROM usage_ledger ul JOIN entitlement e ON e.id = ul.entitlement_id WHERE e.slug = 'credits')
			+ (SELECT count(*) FROM license_entitlement le JOIN entitlement e ON e.id = le.entitlement_id WHERE e.slug = 'credits')`).Scan(&rows))
		assert.Zero(t, rows, "no counter, no ledger row, no licence grant")
	})
}

func TestCombinedUsage_ExistsOnceASourceIsGranted(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newSourceEntitlement(t, "firecrawl-credits")
	newSourceEntitlement(t, "scraped-pages")
	newCombinedEntitlement(t, "credits", source("firecrawl-credits", "0.4"), source("scraped-pages", "0.6"))

	t.Run("OneGrantedSourceIsEnough", func(t *testing.T) {
		license := newLicense(t)
		assignEntitlementToLicense(t, license.Slug, "scraped-pages", 1000)
		instance := newInstanceOn(t, license)
		mustReport(t, instance.Slug, "scraped-pages", 100)

		credits := usagesOf(t, instance.Slug)["credits"]

		readsAs(t, credits, 60, 600)
		require.Len(t, credits.Sources, 1)
		assert.Equal(t, "scraped-pages", credits.Sources[0].EntitlementSlug)
	})

	t.Run("NoGrantedSourceIsNoRowAndA404", func(t *testing.T) {
		license := newLicense(t)
		seats := newSourceEntitlement(t, "seats")
		assignEntitlementToLicense(t, license.Slug, seats.Slug, 10)
		instance := newInstanceOn(t, license)

		assert.NotContains(t, usagesOf(t, instance.Slug), "credits")
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, singleRead(t, instance.Slug, "credits", fiber.StatusNotFound), fiber.StatusNotFound)
		assert.Equal(t, "GetEntitlementUsageMetrics.EntitlementNotAssigned", problem.Code)
	})

	t.Run("AnInstanceThatDoesNotExistIsStillA404", func(t *testing.T) {
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, singleRead(t, "no-such-instance", "credits", fiber.StatusNotFound), fiber.StatusNotFound)
		assert.Equal(t, "GetEntitlementUsageMetrics.InstanceNotFound", problem.Code)
	})
}

func TestCombinedUsage_ReadsAboveItsLimitAndEnforcesNothing(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// A soft source: 100 granted and 100 % more accepted, counted three times.
	newSourceEntitlement(t, "heavy")
	newSourceEntitlement(t, "light")
	newCombinedEntitlement(t, "total", source("heavy", "3"), source("light", "0.1"))
	license := newLicense(t)
	assignEntitlementToLicenseWithOverage(t, license.Slug, "heavy", 100, 100)
	assignEntitlementToLicense(t, license.Slug, "light", 100)
	instance := newInstanceOn(t, license)

	t.Run("TheSumCanReadAboveItsLimit", func(t *testing.T) {
		mustReport(t, instance.Slug, "heavy", 150)

		total := usagesOf(t, instance.Slug)["total"]

		readsAs(t, total, 450, 310)
		assert.EqualValues(t, 0, *total.LimitCapExceededOveragePercent, "a soft source does not make the sum soft")
	})

	t.Run("AReportIsGatedOnItsSourceAloneAgainstItsOwnLimit", func(t *testing.T) {
		accepted := appendUsage(t, instance.Slug, "heavy", 50) // 200 = 100 + 100 %
		assert.Equal(t, fiber.StatusOK, accepted.StatusCode, "the sum is at 600 of 310, and nothing is refused for it")

		refused := appendUsage(t, instance.Slug, "heavy", 1) // 201 > its own maximum
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, refused, fiber.StatusConflict)
		assert.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)
	})

	t.Run("APlanChangeIsNotRefusedBecauseOfIt", func(t *testing.T) {
		// OverQuota is the plan change's check: the entitlements whose usage is above
		// what the instance accepts. The sum is at 600 of 310 and is not one of them.
		over, err := updateinstance.NewUseCase(updateinstance.Deps{
			UserProvider: &tests.StubUserProvider{UserID: testDb.DefaultData.UserID, OrganizationID: testDb.DefaultData.OrganizationID},
			Uof:          uow.NewUnitOfWork(testServer.Dependencies.DB),
		}).OverQuota(t.Context(), instance.Slug)

		require.NoError(t, err)
		assert.Empty(t, over, "heavy is at its maximum, not above it: the combined entitlement enforces nothing")
	})
}

func TestCombinedUsage_ReportsOnItAreRefused(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	world := newCreditsWorld(t)

	problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, appendUsage(t, world.instance.Slug, "credits", 10), fiber.StatusUnprocessableEntity)

	assert.Equal(t, "ReportEntitlementUsageMetric.EntitlementIsCombined", problem.Code)
	assert.Contains(t, problem.Detail, "credits")
	assert.Equal(t, 0.0, usagesOf(t, world.instance.Slug)["credits"].Value.Number.Value, "a refused report reports nothing")
}

func TestCombinedUsage_HasNoHistoryOfItsOwn(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	world := newCreditsWorld(t)
	mustReport(t, world.instance.Slug, "firecrawl-credits", 300)
	base := "/api/instances/" + world.instance.Slug + "/entitlements/"
	organization := "/api/usage/reports/export?"

	// Each route answers under its own operation's code. The two exports share theirs; the
	// organization's names the entitlement by its slug or by its ID, which also reaches a
	// deleted entitlement, whose reports are kept: a combined one has none to keep.
	for name, route := range map[string]struct{ path, code string }{
		"the list":                    {base + "credits/usage/reports", "ListUsageReports.EntitlementIsCombined"},
		"the export":                  {base + "credits/usage/reports/export", "ExportUsageReports.EntitlementIsCombined"},
		"the organization's by slug":  {organization + url.Values{"entitlementSlug": {"credits"}}.Encode(), "ExportUsageReports.EntitlementIsCombined"},
		"the organization's by ID":    {organization + url.Values{"entitlementId": {world.credits.ID.String()}}.Encode(), "ExportUsageReports.EntitlementIsCombined"},
		"the organization's, by both": {organization + url.Values{"entitlementSlug": {"credits"}, "entitlementId": {world.credits.ID.String()}}.Encode(), "ExportUsageReports.EntitlementIsCombined"},
	} {
		t.Run(name, func(t *testing.T) {
			resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", route.path, nil), fiber.TestConfig{})
			require.NoError(t, err)
			t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })

			problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)

			assert.Equal(t, route.code, problem.Code)
			assert.Contains(t, problem.Detail, "credits")
		})
	}

	t.Run("TheSourcesHistoryIsStillTheirs", func(t *testing.T) {
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", base+"firecrawl-credits/usage/reports", nil), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
	})

	// The ID of an entitlement that is gone names the reports it left behind: only a combined
	// one, which never had any, is refused.
	t.Run("AnIDThatNamesNoEntitlementIsStillExported", func(t *testing.T) {
		query := url.Values{"entitlementId": {uuid.NewString()}}
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", organization+query.Encode(), nil), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
	})
}

func TestCombinedUsage_TheWindowIsTheSources(t *testing.T) {
	t.Run("PeriodicSources", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSourceEntitlement(t, "calls", calendarMonth)
		newSourceEntitlement(t, "pages", calendarMonth)
		combined := newCombinedEntitlement(t, "credits", source("calls", "1"), source("pages", "2"))
		require.Equal(t, period.Month, *combined.ResetPeriod)
		license := newLicense(t)
		assignEntitlementToLicense(t, license.Slug, "calls", 100)
		assignEntitlementToLicense(t, license.Slug, "pages", 100)
		instance := newInstanceOn(t, license)
		mustReport(t, instance.Slug, "calls", 10)
		mustReport(t, instance.Slug, "pages", 5)

		usages := usagesOf(t, instance.Slug)

		readsAs(t, usages["credits"], 20, 300)
		require.NotNil(t, usages["credits"].CurrentPeriodStart)
		require.NotNil(t, usages["credits"].CurrentPeriodEnd)
		assert.True(t, usages["calls"].CurrentPeriodStart.Equal(*usages["credits"].CurrentPeriodStart), "the window of its sources")
		assert.True(t, usages["pages"].CurrentPeriodEnd.Equal(*usages["credits"].CurrentPeriodEnd))
	})

	t.Run("AStaleWindowReadsZeroAsItDoesForTheSource", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newSourceEntitlement(t, "calls", calendarMonth)
		newSourceEntitlement(t, "pages", calendarMonth)
		newCombinedEntitlement(t, "credits", source("calls", "1"), source("pages", "1"))
		license := newLicense(t)
		assignEntitlementToLicense(t, license.Slug, "calls", 100)
		assignEntitlementToLicense(t, license.Slug, "pages", 100)
		instance := newInstanceOn(t, license)
		mustReport(t, instance.Slug, "calls", 10)
		// The counter was stored in a window that is over.
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE entitlement_usage SET period_start = period_start - interval '2 months'`)
		require.NoError(t, err)

		readsAs(t, usagesOf(t, instance.Slug)["credits"], 0, 200)
	})
}

func TestCombinedUsage_AnUnlimitedSourceMakesItUnlimited(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newSourceEntitlement(t, "capped")
	newSourceEntitlement(t, "open")
	newCombinedEntitlement(t, "total", source("capped", "0.4"), source("open", "0.6"))
	license := newLicense(t)
	assignEntitlementToLicense(t, license.Slug, "capped", 1000)
	assignEntitlementToLicense(t, license.Slug, "open", -1)
	instance := newInstanceOn(t, license)
	mustReport(t, instance.Slug, "capped", 300)
	mustReport(t, instance.Slug, "open", 100)

	total := usagesOf(t, instance.Slug)["total"]

	readsAs(t, total, 180, -1)
	assert.EqualValues(t, -1, *total.LimitCapExceededOveragePercent)
}

func TestCombinedUsage_ASourceMayFeedSeveralCombinedEntitlements(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	for _, slug := range []string{"source-a", "source-b", "source-c"} {
		newSourceEntitlement(t, slug)
	}
	newCombinedEntitlement(t, "first", source("source-a", "1"), source("source-b", "1"))
	newCombinedEntitlement(t, "second", source("source-a", "2"), source("source-c", "10"))
	license := newLicense(t)
	for _, slug := range []string{"source-a", "source-b", "source-c"} {
		assignEntitlementToLicense(t, license.Slug, slug, 100)
	}
	instance := newInstanceOn(t, license)
	mustReport(t, instance.Slug, "source-a", 5)
	mustReport(t, instance.Slug, "source-b", 7)
	mustReport(t, instance.Slug, "source-c", 1)

	usages := usagesOf(t, instance.Slug)

	readsAs(t, usages["first"], 12, 200)
	readsAs(t, usages["second"], 20, 1200)
}

func TestCombinedUsage_FollowsItsSources(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	world := newCreditsWorld(t)
	mustReport(t, world.instance.Slug, "firecrawl-credits", 300)
	mustReport(t, world.instance.Slug, "scraped-pages", 100)
	readsAs(t, usagesOf(t, world.instance.Slug)["credits"], 180, 1000)

	t.Run("AnExceptionOnASourceMovesTheSum", func(t *testing.T) {
		added := createdException(t, world.instance.Slug, map[string]any{
			"entitlementSlug": "firecrawl-credits", "kind": "ADD", "value": 500, "reason": "a gesture",
		})

		readsAs(t, usagesOf(t, world.instance.Slug)["credits"], 180, 1200)

		require.Equal(t, fiber.StatusNoContent, revokeException(t, world.instance.Slug, added.ID))
		readsAs(t, usagesOf(t, world.instance.Slug)["credits"], 180, 1000)
	})

	t.Run("AnUnlimitedExceptionOnASourceMakesItUnlimited", func(t *testing.T) {
		unlimited := createdException(t, world.instance.Slug, map[string]any{
			"entitlementSlug": "scraped-pages", "kind": "UNLIMITED", "value": nil, "reason": "a pilot",
		})

		readsAs(t, usagesOf(t, world.instance.Slug)["credits"], 180, -1)

		require.Equal(t, fiber.StatusNoContent, revokeException(t, world.instance.Slug, unlimited.ID))
	})

	t.Run("AWeightEditRevaluesThePresent", func(t *testing.T) {
		before := usagesOf(t, world.instance.Slug)["credits"]
		readsAs(t, before, 180, 1000)

		credits := sendInstanceRequest[entitlementschema.Entitlement](t, http.MethodGet, "/api/entitlements/credits", nil, fiber.StatusOK)
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/credits", map[string]any{
			"name": credits.Name, "description": "", "usageSource": "COMBINED_USAGE", "aggregationMethod": "SUM",
			"sources": []map[string]string{{"entitlementSlug": "firecrawl-credits", "weight": "1"}, {"entitlementSlug": "scraped-pages", "weight": "2"}},
		}), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		readsAs(t, usagesOf(t, world.instance.Slug)["credits"], 500, 3000)
	})

	t.Run("RemovingASourceDropsItsShareAtOnce", func(t *testing.T) {
		newSourceEntitlement(t, "other")
		credits := sendInstanceRequest[entitlementschema.Entitlement](t, http.MethodGet, "/api/entitlements/credits", nil, fiber.StatusOK)
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/credits", map[string]any{
			"name": credits.Name, "description": "", "usageSource": "COMBINED_USAGE", "aggregationMethod": "SUM",
			"sources": []map[string]string{{"entitlementSlug": "firecrawl-credits", "weight": "1"}, {"entitlementSlug": "other", "weight": "1"}},
		}), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		after := usagesOf(t, world.instance.Slug)["credits"]

		readsAs(t, after, 300, 1000)
		require.Len(t, after.Sources, 1, "scraped-pages is not a source of it any more, and `other` is not granted to this instance")
		assert.Equal(t, "firecrawl-credits", after.Sources[0].EntitlementSlug)
	})
}

func TestCombinedUsage_ACreditPoolIsASource(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newSourceEntitlement(t, "firecrawl-credits")
	pool := postEntitlement(t, entitlementschema.Entitlement{
		Name: "AI credits", Slug: "ai-credits", Type: ptr.To(entitlementschema.NumberAICredit), AggregationMethod: ptr.To(entitlementschema.Sum),
	})
	newCombinedEntitlement(t, "credits", source("firecrawl-credits", "0.4"), source(pool.Slug, "0.6"))
	license := newLicense(t)
	assignEntitlementToLicense(t, license.Slug, "firecrawl-credits", 1000)
	assignAIPoolToLicense(t, license.Slug, pool.Slug, 1000, 0)
	instance := newInstanceOn(t, license)
	mustReport(t, instance.Slug, "firecrawl-credits", 300)
	newEntitlementUsage(t, instance.Slug, pool.Slug, 100)

	credits := usagesOf(t, instance.Slug)["credits"]

	readsAs(t, credits, 180, 1000)
	assert.Nil(t, credits.Reserved, "what is set aside on the pool is not part of the sum")
	assert.Len(t, credits.Sources, 2)
}

// An exception is set on what is granted: a combined entitlement is granted to
// nobody, and reads as the sum of its sources, which an exception on a source
// moves.
func TestCombinedUsage_TakesNoException(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	world := newCreditsWorld(t)

	for _, kind := range []string{"SET", "ADD"} {
		refused := refusedException(t, world.instance.Slug, map[string]any{
			"entitlementSlug": "credits", "kind": kind, "value": 10, "reason": "a gesture",
		}, fiber.StatusUnprocessableEntity)

		assert.Equal(t, "CreateEntitlementException.EntitlementIsCombined", refused.Code, kind)
	}
	assert.Empty(t, listExceptions(t, world.instance.Slug, "all"))
}
