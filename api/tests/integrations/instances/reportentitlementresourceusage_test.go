package instances_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/errgroup"

	"github.com/kaitencloud/kaiten/api/config"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
)

// A resource of an entitlement that counts per resource has a counter of its own,
// every one measured against the one limit the licence grants.
func TestReportEntitlementResourceUsage(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenTwoResourcesReport_EachHasItsOwnCounterUnderOneLimit", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		first := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 2, "append").usage(t)
		require.Equal(t, 2.0, counterValue(t, first))
		require.NotNil(t, first.ResourceKey)
		require.Equal(t, "stigg", *first.ResourceKey)
		require.Nil(t, first.Resources, "a resource's own usage carries no resources block")
		require.Equal(t, 4.0, first.Limit.Number.Value, "the limit is the entitlement's, whatever the resource")

		paid := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 3, "append").usage(t)
		require.Equal(t, 3.0, counterValue(t, paid))
		require.Equal(t, "paid", *paid.ResourceKey)

		again := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 2, "append").usage(t)
		require.Equal(t, 4.0, counterValue(t, again), "stigg counts apart from paid")

		require.Equal(t, map[string]float64{"stigg": 4, "paid": 3}, resourceValues(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenOneResourceHitsAHardLimit_OnlyItIsRefused", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 4, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 1, "append")

		refused := reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		refused.requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 3, "append")

		require.Equal(t, map[string]float64{"stigg": 4, "paid": 4}, resourceValues(t, instances[0].ID, entitlement.ID))
		rejected := eventPayloads(t, instanceEvents.EntitlementUsageReportRejected.Name, entitlement.Slug)
		require.Len(t, rejected, 1)
		require.Equal(t, "stigg", rejected[0]["resourceKey"])
	})

	t.Run("WhenASoftLimitAllows_EachResourceHasItsOwnAllowance", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		// A limit of 10 with 50% over: 15 is the most a resource may count.
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 10, 50)

		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 15, "append")
		reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 1, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")
		// Another resource has the whole allowance, untouched by the first one's overage.
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 15, "append")

		require.Len(t, eventPayloads(t, instanceEvents.InstanceEntitlementCapExceeded.Name, entitlement.Slug), 2,
			"each resource crosses the cap once, on its own")
	})

	t.Run("WhenTheEntitlementIsPerResource_TheInstanceRouteAnswers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		got := sendResource(t, nil, http.MethodPost, "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage",
			numberReport(1, "append"), nil)

		got.requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.ResourceKeyRequired")
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
		require.Empty(t, ledgerResourceKeys(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheEntitlementIsPerInstance_TheResourceRouteAnswers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		got := reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")

		problem := got.requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.ResourceKeyNotAllowed")
		require.Len(t, problem.Errors, 1)
		require.Equal(t, "path.resourceKey", problem.Errors[0].Location)
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
		require.EqualValues(t, 0, countRows(t, "entitlement_usage", instances[0].ID, entitlement.ID), "nothing was written")
	})

	t.Run("WhenTheValueIsAiUsage_Answers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		payload := map[string]any{"value": map[string]any{
			"type": "ai_usage", "phase": "reserve", "transactionId": "t-1", "model": "m", "requestType": "COMPLETION",
			"usage": map[string]any{"inputTokens": 1},
		}}
		got := sendResource(t, nil, http.MethodPost, resourcesPath(instances[0].Slug, entitlement.Slug, "stigg")+"/usage", payload, nil)

		got.requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.InvalidValueType")
	})

	t.Run("WhenTheKeyIsMalformed_Answers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		for _, key := range []string{repeat("a", 129), "has space", "a/b", "café", "..", ".", "semi;colon", "q?"} {
			got := sendResource(t, nil, http.MethodPost, resourcesPath(instances[0].Slug, entitlement.Slug, key)+"/usage", numberReport(1, "append"), nil)
			problem := got.requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.InvalidResourceKey")
			require.Equal(t, "path.resourceKey", problem.Errors[0].Location, "key %q", key)
		}
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheKeyUsesTheWholeAlphabet_Counts", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		keys := []string{"x", repeat("a", 128), "A.b_c-d:9", uuid.NewString(), "comp:123", "...", ".hidden", "a..b"}
		for _, key := range keys {
			requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, key, 1, "append")
		}
		require.Len(t, resourceRows(t, instances[0].ID, entitlement.ID), len(keys))
	})

	t.Run("WhenTheKeyIsPercentEncoded_ItIsTheKeyDecoded", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		// A browser client escapes with encodeURIComponent, which writes ":" as %3A.
		got := sendResource(t, nil, http.MethodPost,
			"/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/resources/comp%3A123/usage", numberReport(1, "append"), nil)

		usage := got.usage(t)
		require.Equal(t, "comp:123", *usage.ResourceKey)
		require.Equal(t, map[string]float64{"comp:123": 1}, resourceValues(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenKeysDifferOnlyByCase_TheyAreTwoResources", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "Stigg", 3, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")

		require.Equal(t, map[string]float64{"Stigg": 3, "stigg": 1}, resourceValues(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenAccepted_TheJournalRowCarriesTheResourceAndThePairsSequence", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 2, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 5, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 1, "set")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 4)
		for i, row := range rows {
			require.EqualValues(t, i+1, row.ReportSeq, "one sequence for the pair, across its resources")
		}
		require.Equal(t, []string{"stigg", "paid", "stigg", "paid"}, ledgerResourceKeys(t, instances[0].ID, entitlement.ID))
		// Each resource's chain is its own: value_before is the resource's counter.
		require.Equal(t, []string{"0", "0", "2", "5"}, []string{rows[0].ValueBefore, rows[1].ValueBefore, rows[2].ValueBefore, rows[3].ValueBefore})
		require.Equal(t, []string{"2", "5", "3", "1"}, []string{rows[0].ValueAfter, rows[1].ValueAfter, rows[2].ValueAfter, rows[3].ValueAfter})
		require.EqualValues(t, 4, counterReportSeq(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenRefused_NoRowAndNoSequenceAndNoCounter", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		// A first report that is refused creates no counter.
		reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 5, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
		require.Empty(t, ledgerRows(t, instances[0].ID, entitlement.ID))
		require.EqualValues(t, 0, countRows(t, "entitlement_usage", instances[0].ID, entitlement.ID))

		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
		reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 2, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 2)
		require.EqualValues(t, 1, rows[0].ReportSeq)
		require.EqualValues(t, 2, rows[1].ReportSeq, "the refused report took no sequence number")
		require.EqualValues(t, 2, counterReportSeq(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenNegativeAppendAndSetCorrectACounter_EachResourceHoldsItsOwn", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 1, "append")
		removed := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", -1, "append").usage(t)
		require.Equal(t, 1.0, counterValue(t, removed), "removing a source takes one off the resource that lost it")
		corrected := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 3, "set").usage(t)
		require.Equal(t, 3.0, counterValue(t, corrected), "set writes the absolute count of one resource")

		require.Equal(t, map[string]float64{"stigg": 1, "paid": 3}, resourceValues(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenOneEventFeedsTwoResourcesUnderOneKey_BothCountAndEachReplaysApart", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		key := "source-created:" + uuid.NewString()

		first := reportResourceWithKey(t, nil, instances[0].Slug, entitlement.Slug, "stigg", 2, "append", key)
		second := reportResourceWithKey(t, nil, instances[0].Slug, entitlement.Slug, "paid", 3, "append", key)
		require.Empty(t, first.replayed)
		require.Empty(t, second.replayed, "the same key on another resource is another report")
		require.Equal(t, 2.0, counterValue(t, first.usage(t)))
		require.Equal(t, 3.0, counterValue(t, second.usage(t)))

		replayFirst := reportResourceWithKey(t, nil, instances[0].Slug, entitlement.Slug, "stigg", 2, "append", key)
		replaySecond := reportResourceWithKey(t, nil, instances[0].Slug, entitlement.Slug, "paid", 3, "append", key)
		require.Equal(t, "true", replayFirst.replayed)
		require.Equal(t, "true", replaySecond.replayed)
		replayed := replayFirst.usage(t)
		require.Equal(t, 2.0, counterValue(t, replayed), "a replay answers the counter of its own resource")
		require.NotNil(t, replayed.ResourceKey)
		require.Equal(t, "stigg", *replayed.ResourceKey)
		require.Equal(t, 3.0, counterValue(t, replaySecond.usage(t)))

		require.Equal(t, map[string]float64{"stigg": 2, "paid": 3}, resourceValues(t, instances[0].ID, entitlement.ID))
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 2, "a replay writes no row")
	})

	t.Run("WhenAKeyIsReusedOnTheSameResourceWithAnotherValue_Answers409", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		reportResourceWithKey(t, nil, instances[0].Slug, entitlement.Slug, "stigg", 2, "append", "evt-1").usage(t)
		got := reportResourceWithKey(t, nil, instances[0].Slug, entitlement.Slug, "stigg", 3, "append", "evt-1")

		got.requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.TransactionIdReused")
		require.Equal(t, map[string]float64{"stigg": 2}, resourceValues(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheIdempotencyKeyIsEmpty_StillAnswers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		got := reportResourceWithKey(t, nil, instances[0].Slug, entitlement.Slug, "stigg", 1, "append", "")

		got.requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.InvalidTransactionId")
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheEntitlementIsNotGranted_Answers404", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)

		got := reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")

		got.requireProblem(t, fiber.StatusNotFound, "ReportEntitlementUsageMetric.ContextNotFound")
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheBehaviorIsUnknown_Answers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		got := sendResource(t, nil, http.MethodPost, resourcesPath(instances[0].Slug, entitlement.Slug, "stigg")+"/usage",
			map[string]any{"value": map[string]any{"type": "number", "value": 1}}, nil)

		got.requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.InvalidBehavior")
	})

	t.Run("WhenTheCallerLacksWriteInstances_Answers403", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		readOnly := newServerWithConfig(t, tests.TestServerOptions{Scopes: []string{scope.Read(scope.Instances)}})

		got := sendResource(t, readOnly.App, http.MethodPost, resourcesPath(instances[0].Slug, entitlement.Slug, "stigg")+"/usage",
			numberReport(1, "append"), nil)

		require.Equal(t, fiber.StatusForbidden, got.status, "body: %s", got.body)
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
	})
}

func TestReportEntitlementResourceUsage_Ceiling(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenTheCeilingIsReached_ANewResourceIsRefusedAndAnExistingOneStillCounts", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		app := newServerWithConfig(t, tests.TestServerOptions{ConfigOverride: func(c *config.Config) { c.Usage.MaxResources = 2 }}).App

		send := func(key string, value float64) resourceReport {
			return sendResource(t, app, http.MethodPost, resourcesPath(instances[0].Slug, entitlement.Slug, key)+"/usage", numberReport(value, "append"), nil)
		}
		send("a", 1).usage(t)
		send("b", 1).usage(t)

		refused := send("c", 1)
		problem := refused.requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.ResourceLimitReached")
		require.Equal(t, "path.resourceKey", problem.Errors[0].Location)
		require.Equal(t, "c", problem.Errors[0].Value)
		require.Equal(t, map[string]float64{"a": 1, "b": 1}, resourceValues(t, instances[0].ID, entitlement.ID), "the refused resource has no counter")

		require.Equal(t, 2.0, counterValue(t, send("a", 1).usage(t)), "an existing resource still counts")
		require.Equal(t, 2.0, counterValue(t, send("b", 1).usage(t)))
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 4, "the refused report left no row")
	})

	t.Run("WhenAResourceIsDeleted_ASlotFreesUp", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		app := newServerWithConfig(t, tests.TestServerOptions{ConfigOverride: func(c *config.Config) { c.Usage.MaxResources = 1 }}).App
		send := func(method, key string) resourceReport {
			if method == http.MethodDelete {
				return sendResource(t, app, method, resourcesPath(instances[0].Slug, entitlement.Slug, key), nil, nil)
			}
			return sendResource(t, app, method, resourcesPath(instances[0].Slug, entitlement.Slug, key)+"/usage", numberReport(1, "append"), nil)
		}

		send(http.MethodPost, "a").usage(t)
		send(http.MethodPost, "b").requireProblem(t, fiber.StatusUnprocessableEntity, "ReportEntitlementUsageMetric.ResourceLimitReached")
		require.Equal(t, fiber.StatusNoContent, send(http.MethodDelete, "a").status)
		send(http.MethodPost, "b").usage(t)

		require.Equal(t, map[string]float64{"b": 1}, resourceValues(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheCeilingIsConfiguredAtItsDefault_TenThousandResourcesAreAllowed", func(t *testing.T) {
		// The suite's server is built from a bare config: its ceiling is the code's default.
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		for i := range 5 {
			requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, fmt.Sprintf("r%d", i), 1, "append")
		}
		require.Len(t, resourceRows(t, instances[0].ID, entitlement.ID), 5)
	})
}

func TestReportEntitlementResourceUsage_Concurrency(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenResourcesReportConcurrently_SequenceStaysContiguousAndSummaryIsTheMax", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, -1, -1)

		const resources, perResource = 6, 5
		var group errgroup.Group
		group.SetLimit(resources * perResource)
		var mu sync.Mutex
		statuses := map[int]int{}
		for resource := range resources {
			for range perResource {
				group.Go(func() error {
					req := httptest.NewRequest(http.MethodPost, resourcesPath(instances[0].Slug, entitlement.Slug, fmt.Sprintf("r%d", resource))+"/usage",
						strings.NewReader(fmt.Sprintf(`{"value":{"type":"number","value":%d},"behavior":"append"}`, resource+1)))
					req.Header.Set("Content-Type", "application/json")
					resp, err := testServer.App.Test(req, fiber.TestConfig{})
					if err != nil {
						return err
					}
					defer func() { _ = resp.Body.Close() }()
					mu.Lock()
					statuses[resp.StatusCode]++
					mu.Unlock()
					return nil
				})
			}
		}
		require.NoError(t, group.Wait())
		require.Equal(t, map[int]int{fiber.StatusOK: resources * perResource}, statuses)

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, resources*perResource)
		for i, row := range rows {
			require.EqualValues(t, i+1, row.ReportSeq, "the pair's sequence has no gap and no repeat")
		}
		require.EqualValues(t, resources*perResource, counterReportSeq(t, instances[0].ID, entitlement.ID))

		values := resourceValues(t, instances[0].ID, entitlement.ID)
		require.Len(t, values, resources)
		for resource := range resources {
			require.Equal(t, float64((resource+1)*perResource), values[fmt.Sprintf("r%d", resource)])
		}
		// The pair's own row reads as the highest counter: the last resource's.
		require.Equal(t, float64(resources*perResource), counterValue(t, getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)))
	})
}

// countRows counts the rows of a table keyed by instance and entitlement.
func countRows(t *testing.T, table string, instanceID, entitlementID uuid.UUID) int {
	t.Helper()
	var count int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		"SELECT count(*) FROM "+table+" WHERE instance_id = $1 AND entitlement_id = $2", instanceID, entitlementID).Scan(&count))
	return count
}
