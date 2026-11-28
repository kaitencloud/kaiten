package instances_test

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
)

// resourcePage is a page of GET .../resources.
type resourcePage = pagination.Page[instanceschema.EntitlementResource]

func listResources(t *testing.T, instanceSlug, entitlementSlug string, query url.Values) resourceReport {
	t.Helper()
	path := resourcesPath(instanceSlug, entitlementSlug, "")
	if len(query) > 0 {
		path += "?" + query.Encode()
	}
	return sendResource(t, nil, http.MethodGet, path, nil, nil)
}

func (r resourceReport) page(t *testing.T) resourcePage {
	t.Helper()
	require.Equal(t, fiber.StatusOK, r.status, "body: %s", r.body)
	return decodeBody[resourcePage](t, r.body)
}

func keysOf(items []instanceschema.EntitlementResource) []string {
	out := make([]string, len(items))
	for i, item := range items {
		out[i] = item.ResourceKey
	}
	return out
}

// seedResource writes one resource's counter straight into the table, with an
// explicit window: how the tests simulate a window that has closed.
func seedResource(t *testing.T, instanceID, entitlementID uuid.UUID, resourceKey string, value float64, eventCount int32, periodStart *time.Time) {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO entitlement_resource_usage (entitlement_id, instance_id, resource_key, organization_id, value, period_start)
		VALUES ($1, $2, $3, $4, jsonb_build_object('type', 'number', 'value', $5::float8, 'event_count', $6::int), $7)
		ON CONFLICT (entitlement_id, instance_id, resource_key)
		  DO UPDATE SET value = EXCLUDED.value, period_start = EXCLUDED.period_start`,
		entitlementID, instanceID, resourceKey, testDb.DefaultData.OrganizationID, value, eventCount, periodStart)
	require.NoError(t, err)
}

func TestGetEntitlementResourceUsage(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenNothingWasReported_ReadsZeroAgainstTheLimit", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		usage := getResourceUsage(t, instances[0].Slug, entitlement.Slug, "stigg").usage(t)

		require.Equal(t, 0.0, counterValue(t, usage), "a check before creating works: an unknown resource reads zero")
		require.Equal(t, 4.0, usage.Limit.Number.Value)
		require.Equal(t, entitlement.Slug, usage.EntitlementSlug)
		require.NotNil(t, usage.ResourceKey)
		require.Equal(t, "stigg", *usage.ResourceKey)
		require.Nil(t, usage.Resources)
		require.Equal(t, instanceschema.SourceLicense, usage.Source)
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID), "a read creates nothing")
	})

	t.Run("WhenReported_ReadsTheResourcesOwnCounter", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 1, "append")

		stigg := getResourceUsage(t, instances[0].Slug, entitlement.Slug, "stigg").usage(t)
		paid := getResourceUsage(t, instances[0].Slug, entitlement.Slug, "paid").usage(t)

		require.Equal(t, 3.0, counterValue(t, stigg))
		require.EqualValues(t, 1, stigg.Value.Number.EventCount)
		require.Equal(t, 1.0, counterValue(t, paid))
		require.Equal(t, "paid", *paid.ResourceKey)
	})

	t.Run("WhenTheKeyIsPercentEncoded_ReadsTheDecodedKey", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "comp:123", 2, "append")

		got := sendResource(t, nil, http.MethodGet,
			"/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/resources/comp%3A123/usage", nil, nil)

		require.Equal(t, 2.0, counterValue(t, got.usage(t)))
	})

	t.Run("WhenTheWindowClosed_ReadsZeroInTheCurrentWindow", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t, withPeriod(period.Month, period.Calendar))
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		current, err := period.Current(databaseNow(t), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.AddDate(0, -1, 0)
		seedResource(t, instances[0].ID, entitlement.ID, "stale", 3, 2, &previous)
		seedResource(t, instances[0].ID, entitlement.ID, "fresh", 2, 1, &current.Start)

		stale := getResourceUsage(t, instances[0].Slug, entitlement.Slug, "stale").usage(t)
		fresh := getResourceUsage(t, instances[0].Slug, entitlement.Slug, "fresh").usage(t)

		require.Equal(t, 0.0, counterValue(t, stale), "a stored counter of a closed window reads zero")
		require.True(t, stale.CurrentPeriodStart.Equal(current.Start), "in the window that is open now")
		require.True(t, stale.CurrentPeriodEnd.Equal(current.End))
		require.Equal(t, 2.0, counterValue(t, fresh))
	})

	t.Run("WhenTheEntitlementIsPerInstance_Answers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		getResourceUsage(t, instances[0].Slug, entitlement.Slug, "stigg").
			requireProblem(t, fiber.StatusUnprocessableEntity, "GetEntitlementResourceUsage.NotPerResource")
	})

	t.Run("WhenTheKeyIsMalformed_Answers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		for _, key := range []string{repeat("a", 129), "has space", "..", "."} {
			getResourceUsage(t, instances[0].Slug, entitlement.Slug, key).
				requireProblem(t, fiber.StatusUnprocessableEntity, "GetEntitlementResourceUsage.InvalidResourceKey")
		}
	})

	t.Run("WhenThePairIsUnknownOrNotGranted_Answers404", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)

		getResourceUsage(t, instances[0].Slug, entitlement.Slug, "stigg").
			requireProblem(t, fiber.StatusNotFound, "GetEntitlementResourceUsage.EntitlementNotAssigned")
		getResourceUsage(t, "nope", entitlement.Slug, "stigg").
			requireProblem(t, fiber.StatusNotFound, "GetEntitlementResourceUsage.InstanceNotFound")
		getResourceUsage(t, instances[0].Slug, "nope", "stigg").
			requireProblem(t, fiber.StatusNotFound, "GetEntitlementResourceUsage.EntitlementNotFound")
	})

	t.Run("TheReadIsAnnouncedWithItsResource", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
		getResourceUsage(t, instances[0].Slug, entitlement.Slug, "stigg").usage(t)
		getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)

		reads := eventPayloads(t, instanceEvents.EntitlementValueGet.Name, entitlement.Slug)

		require.Len(t, reads, 2)
		require.Equal(t, "stigg", reads[0]["resourceKey"])
		require.Equal(t, entitlement.Slug, reads[0]["entitlement_slug"])
		require.NotContains(t, reads[1], "resourceKey", "the entitlement's own read names no resource")
	})

	t.Run("WhenTheCallerLacksReadInstances_Answers403", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		wrongScope := newServerWithConfig(t, tests.TestServerOptions{Scopes: []string{scope.Read(scope.Customers)}})

		for _, path := range []string{
			resourcesPath(instances[0].Slug, entitlement.Slug, "stigg") + "/usage",
			resourcesPath(instances[0].Slug, entitlement.Slug, ""),
		} {
			got := sendResource(t, wrongScope.App, http.MethodGet, path, nil, nil)
			require.Equal(t, fiber.StatusForbidden, got.status, "%s: %s", path, got.body)
		}
	})
}

func TestListEntitlementResources(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenNoResourceHoldsACounter_ListsNothing", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		page := listResources(t, instances[0].Slug, entitlement.Slug, nil).page(t)

		require.NotNil(t, page.Items, "an empty list is an empty array")
		require.Empty(t, page.Items)
		require.False(t, page.HasMore)
		require.Nil(t, page.NextCursor)
	})

	t.Run("WhenPaged_ListsEveryResourceOnceInKeyOrder", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		// The order is the bytes' order, whatever the database's locale: capitals
		// first, then "-" (45) before "." (46) before "_" (95).
		keys := []string{"b", "a", "B", "A", "a-1", "a.1", "a_1", "a:1"}
		for i, key := range keys {
			requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, key, float64(i%3+1), "append")
		}
		want := []string{"A", "B", "a", "a-1", "a.1", "a:1", "a_1", "b"}

		var listed []string
		var cursor string
		for pages := 0; ; pages++ {
			require.Less(t, pages, 10, "the cursor must reach the end")
			query := url.Values{"limit": {"3"}}
			if cursor != "" {
				query.Set("cursor", cursor)
			}
			page := listResources(t, instances[0].Slug, entitlement.Slug, query).page(t)
			listed = append(listed, keysOf(page.Items)...)
			if !page.HasMore {
				require.Nil(t, page.NextCursor)
				break
			}
			require.LessOrEqual(t, len(page.Items), 3)
			require.NotNil(t, page.NextCursor)
			cursor = *page.NextCursor
		}

		require.Equal(t, want, listed)
	})

	t.Run("WhenListed_EachResourceCarriesItsCounter", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 2, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 3, "append")

		page := listResources(t, instances[0].Slug, entitlement.Slug, nil).page(t)

		require.Equal(t, []string{"paid", "stigg"}, keysOf(page.Items))
		require.Equal(t, 3.0, page.Items[0].Value.Value)
		require.EqualValues(t, 1, page.Items[0].Value.EventCount)
		require.Equal(t, 3.0, page.Items[1].Value.Value)
		require.EqualValues(t, 2, page.Items[1].Value.EventCount)
		require.Nil(t, page.Items[0].CurrentPeriodStart, "a lifetime counter has no window")
	})

	t.Run("WhenThereAreMoreThanThePageHolds_TheDefaultAndTheMaximumBound", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO entitlement_resource_usage (entitlement_id, instance_id, resource_key, organization_id, value)
			SELECT $1, $2, 'r' || lpad(n::text, 4, '0'), $3, '{"type":"number","value":1,"event_count":1}'::jsonb
			FROM generate_series(1, 230) n`, entitlement.ID, instances[0].ID, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		first := listResources(t, instances[0].Slug, entitlement.Slug, nil).page(t)
		require.Len(t, first.Items, int(pagination.DefaultLimit))
		require.True(t, first.HasMore)

		widest := listResources(t, instances[0].Slug, entitlement.Slug, url.Values{"limit": {"200"}}).page(t)
		require.Len(t, widest.Items, int(pagination.MaxLimit))
		require.True(t, widest.HasMore)

		listResources(t, instances[0].Slug, entitlement.Slug, url.Values{"limit": {"201"}}).
			requireProblem(t, fiber.StatusUnprocessableEntity, "UNPROCESSABLE")
	})

	t.Run("WhenTheCursorIsBad_Answers400", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		listResources(t, instances[0].Slug, entitlement.Slug, url.Values{"cursor": {"not-a-cursor!"}}).
			requireProblem(t, fiber.StatusBadRequest, "ListEntitlementResources.InvalidCursor")
	})

	t.Run("WhenTheEntitlementIsPerInstance_Answers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		listResources(t, instances[0].Slug, entitlement.Slug, nil).
			requireProblem(t, fiber.StatusUnprocessableEntity, "ListEntitlementResources.NotPerResource")
	})

	t.Run("WhenThePairIsUnknown_Answers404", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)

		listResources(t, "nope", entitlement.Slug, nil).requireProblem(t, fiber.StatusNotFound, "ListEntitlementResources.InstanceNotFound")
		listResources(t, instances[0].Slug, "nope", nil).requireProblem(t, fiber.StatusNotFound, "ListEntitlementResources.EntitlementNotFound")
	})

	t.Run("WhenTheLicenceNoLongerGrantsIt_TheResourcesAreStillListed", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		seedResource(t, instances[0].ID, entitlement.ID, "stigg", 2, 1, nil)

		page := listResources(t, instances[0].Slug, entitlement.Slug, nil).page(t)

		require.Equal(t, []string{"stigg"}, keysOf(page.Items), "resources outlive a licence change")
	})

	t.Run("WhenTheWindowClosed_TheListReadsZeroInTheCurrentWindow", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t, withPeriod(period.Month, period.Calendar))
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		current, err := period.Current(databaseNow(t), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.AddDate(0, -1, 0)
		seedResource(t, instances[0].ID, entitlement.ID, "a-stale", 3, 2, &previous)
		seedResource(t, instances[0].ID, entitlement.ID, "b-fresh", 2, 1, &current.Start)

		page := listResources(t, instances[0].Slug, entitlement.Slug, nil).page(t)

		require.Equal(t, []string{"a-stale", "b-fresh"}, keysOf(page.Items), "a stale resource is still a resource")
		require.Equal(t, 0.0, page.Items[0].Value.Value)
		require.Equal(t, 2.0, page.Items[1].Value.Value)
		for _, item := range page.Items {
			require.True(t, item.CurrentPeriodStart.Equal(current.Start))
			require.True(t, item.CurrentPeriodEnd.Equal(current.End))
		}
	})
}

func TestDeleteEntitlementResource(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenTheResourceHeldACounter_ForgetsItAndAnnouncesIt", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 2, "append")

		got := deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg")

		require.Equal(t, fiber.StatusNoContent, got.status, "body: %s", got.body)
		require.Equal(t, map[string]float64{"paid": 2}, resourceValues(t, instances[0].ID, entitlement.ID))
		deleted := eventPayloads(t, instanceEvents.InstanceEntitlementResourceDeleted.Name, entitlement.Slug)
		require.Len(t, deleted, 1)
		require.Equal(t, "stigg", deleted[0]["resourceKey"])
		require.Equal(t, entitlement.Slug, deleted[0]["entitlement_slug"])
		require.Equal(t, entitlement.ID.String(), deleted[0]["entitlement_id"])
		require.Equal(t, instances[0].ID.String(), deleted[0]["instance_id"])
		require.EqualValues(t, 4, deleted[0]["value"])
		require.EqualValues(t, 2, deleted[0]["event_count"])
	})

	t.Run("WhenDeleted_NoJournalRowIsWrittenAndTheSequenceDoesNotMove", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 2, "append")

		require.Equal(t, fiber.StatusNoContent, deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg").status)

		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 2, "the journal keeps the deleted resource's reports")
		require.EqualValues(t, 2, counterReportSeq(t, instances[0].ID, entitlement.ID), "a delete is not a report")
		require.Equal(t, []string{"stigg", "paid"}, ledgerResourceKeys(t, instances[0].ID, entitlement.ID))
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 1, "append")
		require.EqualValues(t, 3, counterReportSeq(t, instances[0].ID, entitlement.ID), "the next report takes the next number")
	})

	t.Run("WhenTheHighestIsDeleted_TheEntitlementReadsTheNextHighest", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 7, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 5, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "schematic", 2, "append")
		require.Equal(t, 7.0, counterValue(t, getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)))

		deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg")
		require.Equal(t, 5.0, counterValue(t, getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)))
		deleteResource(t, instances[0].Slug, entitlement.Slug, "paid")
		deleteResource(t, instances[0].Slug, entitlement.Slug, "schematic")

		usage := getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)
		require.Equal(t, 0.0, counterValue(t, usage), "no resource is left")
		require.NotNil(t, usage.Resources)
		require.EqualValues(t, 0, usage.Resources.Count)
	})

	t.Run("WhenDeletedTwice_TheSecondIsA204AndAnnouncesNothing", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")

		require.Equal(t, fiber.StatusNoContent, deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg").status)
		require.Equal(t, fiber.StatusNoContent, deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg").status)
		require.Equal(t, fiber.StatusNoContent, deleteResource(t, instances[0].Slug, entitlement.Slug, "never-reported").status)

		require.Len(t, eventPayloads(t, instanceEvents.InstanceEntitlementResourceDeleted.Name, entitlement.Slug), 1)
	})

	t.Run("WhenReportedAgainAfterDeletion_TheCounterStartsAtZero", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 4, "append")
		reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 1, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")

		deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg")
		again := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append").usage(t)

		require.Equal(t, 1.0, counterValue(t, again))
		require.EqualValues(t, 1, again.Value.Number.EventCount)
	})

	t.Run("WhenDeleted_ItsPastReportsStayInTheHistory", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
		deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg")

		page := historyGet(t, testServer.App, reportsPath(instances[0].Slug, entitlement.Slug), nil).page(t)

		require.Len(t, page.Items, 1)
		require.NotNil(t, page.Items[0].ResourceKey)
		require.Equal(t, "stigg", *page.Items[0].ResourceKey)
	})

	t.Run("WhenTheEntitlementIsNotGrantedAnyMore_TheResourceCanStillBeDeleted", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		seedResource(t, instances[0].ID, entitlement.ID, "stigg", 2, 1, nil)

		require.Equal(t, fiber.StatusNoContent, deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg").status)
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheEntitlementIsPerInstance_Answers422", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)

		deleteResource(t, instances[0].Slug, entitlement.Slug, "stigg").
			requireProblem(t, fiber.StatusUnprocessableEntity, "DeleteEntitlementResource.NotPerResource")
	})

	t.Run("WhenTheKeyIsMalformedOrThePairUnknown_Answers422Or404", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)

		for _, key := range []string{repeat("a", 129), "has space", ".."} {
			deleteResource(t, instances[0].Slug, entitlement.Slug, key).
				requireProblem(t, fiber.StatusUnprocessableEntity, "DeleteEntitlementResource.InvalidResourceKey")
		}
		deleteResource(t, "nope", entitlement.Slug, "stigg").requireProblem(t, fiber.StatusNotFound, "DeleteEntitlementResource.ContextNotFound")
		deleteResource(t, instances[0].Slug, "nope", "stigg").requireProblem(t, fiber.StatusNotFound, "DeleteEntitlementResource.ContextNotFound")
	})

	t.Run("WhenTheCallerLacksWriteInstances_Answers403AndKeepsTheCounter", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 2, "append")
		readOnly := newServerWithConfig(t, tests.TestServerOptions{Scopes: []string{scope.Read(scope.Instances)}})

		got := sendResource(t, readOnly.App, http.MethodDelete, resourcesPath(instances[0].Slug, entitlement.Slug, "stigg"), nil, nil)

		require.Equal(t, fiber.StatusForbidden, got.status, "body: %s", got.body)
		require.Equal(t, map[string]float64{"stigg": 2}, resourceValues(t, instances[0].ID, entitlement.ID))
	})
}

// What an entitlement reads as, to every reader of the pair: its highest counter,
// the limit of each resource, and how many resources stand behind it.
func TestEntitlementUsage_PerResourceEntitlement(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("ReadsAsItsHighestCounterWithTheResourcesBlock", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		other := newEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		assignHardLimit(t, instances[0].LicenseSlug, other.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 2, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 4, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "schematic", 4, "append")
		requireStatus(t, fiber.StatusOK, instances[0].Slug, other.Slug, 1, "append")

		single := getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)
		listed := usagesOf(t, instances[0].Slug)

		for name, usage := range map[string]instanceschema.EntitlementUsage{"single read": single, "list read": listed[entitlement.Slug]} {
			require.Equal(t, 4.0, counterValue(t, usage), "%s: the highest counter", name)
			require.Equal(t, 4.0, usage.Limit.Number.Value, "%s: the limit of each resource", name)
			require.Nil(t, usage.ResourceKey, "%s: the entitlement's own usage names no resource", name)
			require.NotNil(t, usage.Resources, name)
			require.EqualValues(t, 3, usage.Resources.Count, name)
			require.EqualValues(t, 2, usage.Resources.AtLimit, "%s: two have reached the limit", name)
		}
		require.Nil(t, listed[other.Slug].Resources, "an entitlement that counts per instance has no resources block")
	})

	t.Run("WhenALimitIsSoftOrUnlimited_AtLimitCountsAtOrAboveTheBaseLimitOnlyWhenFinite", func(t *testing.T) {
		instances := newInstances(t, 2)
		soft := newResourceEntitlement(t)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, soft.Slug, 10, 50)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, soft.Slug, "a", 10, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, soft.Slug, "b", 13, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, soft.Slug, "c", 9, "append")
		unlimited := newResourceEntitlement(t)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, unlimited.Slug, -1, -1)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, unlimited.Slug, "a", 1000, "append")
		zero := newResourceEntitlement(t)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, zero.Slug, 0, 100)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, zero.Slug, "a", 0, "append")

		usages := usagesOf(t, instances[0].Slug)

		require.EqualValues(t, 2, usages[soft.Slug].Resources.AtLimit, "10 and 13 are at or above a limit of 10; 9 is not")
		require.EqualValues(t, 3, usages[soft.Slug].Resources.Count)
		require.EqualValues(t, 0, usages[unlimited.Slug].Resources.AtLimit, "an unlimited entitlement has no limit to reach")
		require.EqualValues(t, 1, usages[unlimited.Slug].Resources.Count)
		require.EqualValues(t, 1, usages[zero.Slug].Resources.AtLimit, "a limit of zero is reached by any counter")
	})

	t.Run("WhenTheWindowClosed_NoResourceIsAtItsLimitAndTheValueReadsZero", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t, withPeriod(period.Month, period.Calendar))
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		current, err := period.Current(databaseNow(t), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.AddDate(0, -1, 0)
		seedResource(t, instances[0].ID, entitlement.ID, "stigg", 4, 3, &previous)
		seedResource(t, instances[0].ID, entitlement.ID, "paid", 4, 2, &previous)
		_, err = testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO entitlement_usage (entitlement_id, instance_id, organization_id, value, period_start, report_seq)
			VALUES ($1, $2, $3, '{"type":"number","value":4,"event_count":3}'::jsonb, $4, 2)`,
			entitlement.ID, instances[0].ID, testDb.DefaultData.OrganizationID, previous)
		require.NoError(t, err)

		usage := getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)

		require.Equal(t, 0.0, counterValue(t, usage), "last month's counters are not this month's usage")
		require.EqualValues(t, 2, usage.Resources.Count, "they are still resources")
		require.EqualValues(t, 0, usage.Resources.AtLimit, "and none is at its limit now")
	})

	t.Run("WhenTheHighestIsLowered_TheEntitlementFollows", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 8, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 5, "append")

		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", -4, "append")
		require.Equal(t, 5.0, counterValue(t, getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)), "paid is now the highest")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 1, "set")
		require.Equal(t, 4.0, counterValue(t, getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)), "set lowered it, and stigg is highest again")
	})

	t.Run("EveryAggregationMethodWorksPerResource", func(t *testing.T) {
		for _, tc := range []struct {
			method entitlementschema.AggregationMethod
			values []float64
			want   float64
		}{
			{entitlementschema.Count, []float64{7, 7, 7}, 3},
			{entitlementschema.Sum, []float64{1, 2, 3}, 6},
			{entitlementschema.Average, []float64{2, 4, 6}, 4},
			{entitlementschema.Min, []float64{-1, -5, 3}, -5},
			{entitlementschema.Max, []float64{5, 2, 9}, 9},
			{entitlementschema.Latest, []float64{5, 2, 9}, 9},
		} {
			t.Run(string(tc.method), func(t *testing.T) {
				instances := newInstances(t, 1)
				entitlement := newResourceEntitlement(t, withAggregation(tc.method))
				assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 1000, 0)

				for _, value := range tc.values {
					// A second resource folds its own values, apart from the first's.
					requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "other", 100, "append")
					requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", value, "append")
				}

				values := resourceValues(t, instances[0].ID, entitlement.ID)
				require.Equal(t, tc.want, values["stigg"], "%s per resource", tc.method)
			})
		}
	})
}

func TestEntitlementUsage_PerResourceLimitIsTheEffectiveOne(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("AnExceptionChangesTheLimitOfEveryResource", func(t *testing.T) {
		license := newLicense(t)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, license.Slug, entitlement.Slug, 4)
		instance := newInstanceOn(t, license)
		requireResourceReport(t, fiber.StatusOK, instance.Slug, entitlement.Slug, "stigg", 4, "append")
		reportResource(t, instance.Slug, entitlement.Slug, "stigg", 1, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")
		reportResource(t, instance.Slug, entitlement.Slug, "paid", 5, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")

		createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": entitlement.Slug, "kind": "ADD", "value": 2, "reason": "a bigger limit for everyone",
		})

		// Raising the one number raises it for all of them.
		require.Equal(t, 6.0, counterValue(t, requireResourceReport(t, fiber.StatusOK, instance.Slug, entitlement.Slug, "stigg", 2, "append").usage(t)))
		require.Equal(t, 6.0, counterValue(t, requireResourceReport(t, fiber.StatusOK, instance.Slug, entitlement.Slug, "paid", 6, "append").usage(t)))
		reportResource(t, instance.Slug, entitlement.Slug, "schematic", 7, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")
		usage := getEntitlementUsage(t, instance.Slug, entitlement.Slug)
		require.Equal(t, 6.0, usage.Limit.Number.Value)
		require.EqualValues(t, 2, usage.Resources.AtLimit)
	})
}

func TestEntitlementResources_WarningThresholdIsPerResource(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instances := newInstances(t, 1)
	entitlement := newResourceEntitlement(t, withWarningThreshold(50))
	assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)

	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 4, "append")
	require.Empty(t, eventPayloads(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name, entitlement.Slug), "4 is below half of 10")
	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 5, "append")
	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 1, "append")
	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "schematic", 10, "append")

	warnings := eventPayloads(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name, entitlement.Slug)
	keys := make([]any, len(warnings))
	for i, w := range warnings {
		keys[i] = w["resourceKey"]
	}
	require.Equal(t, []any{"paid", "stigg", "schematic"}, keys, "each resource crosses the boundary once, on its own report")
	reached := eventPayloads(t, instanceEvents.InstanceEntitlementUsageReached.Name, entitlement.Slug)
	require.Len(t, reached, 1)
	require.Equal(t, "schematic", reached[0]["resourceKey"], "USAGE_REACHED is the resource's own usage, which names it")
}

func TestEntitlementResources_EventsCarryTheirResource(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instances := newInstances(t, 1)
	entitlement := newResourceEntitlement(t)
	assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 4, 50)
	capped, landed := newEntitlement(t), newEntitlement(t)
	assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, capped.Slug, 4, 50)
	assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, landed.Slug, 4, 50)

	// stigg goes over the limit (cap exceeded) and past its soft allowance of 6
	// (rejected); paid lands exactly on it (reached). The same two stories
	// happen to entitlements that count per instance.
	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 2, "append")
	reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 2, "append").
		requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")
	requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 4, "append")
	requireStatus(t, fiber.StatusOK, instances[0].Slug, capped.Slug, 3, "append")
	requireStatus(t, fiber.StatusOK, instances[0].Slug, capped.Slug, 2, "append")
	requireStatus(t, fiber.StatusOK, instances[0].Slug, landed.Slug, 4, "append")

	// name -> events that name a resource, events that name none
	want := map[string][2]int{
		instanceEvents.EntitlementUsageReportAccepted.Name:  {3, 3},
		instanceEvents.EntitlementUsageReportRejected.Name:  {1, 0},
		instanceEvents.InstanceEntitlementUsageReached.Name: {1, 1},
		instanceEvents.InstanceEntitlementCapExceeded.Name:  {1, 1},
	}
	for name, counts := range want {
		named, unnamed := map[any]int{}, 0
		for _, payload := range eventPayloads(t, name, entitlement.Slug, capped.Slug, landed.Slug) {
			if key, has := payload["resourceKey"]; has {
				named[key]++
			} else {
				unnamed++
			}
		}
		require.Equal(t, counts, [2]int{sum(named), unnamed}, "%s: a resource's events name it, an instance's name none (%v)", name, named)
		for key := range named {
			require.Contains(t, []any{"stigg", "paid"}, key, name)
		}
	}
}

func sum(counts map[any]int) int {
	total := 0
	for _, n := range counts {
		total += n
	}
	return total
}

func TestEntitlementResources_RolloverIsPerResource(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenTheWindowRolls_EachResourceRollsOnItsOwnReport", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t, withPeriod(period.Month, period.Calendar))
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		current, err := period.Current(databaseNow(t), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.AddDate(0, -1, 0)
		seedResource(t, instances[0].ID, entitlement.ID, "stigg", 6, 3, &previous)
		seedResource(t, instances[0].ID, entitlement.ID, "paid", 8, 4, &previous)
		_, err = testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO entitlement_usage (entitlement_id, instance_id, organization_id, value, period_start, report_seq)
			VALUES ($1, $2, $3, '{"type":"number","value":8,"event_count":4}'::jsonb, $4, 7)`,
			entitlement.ID, instances[0].ID, testDb.DefaultData.OrganizationID, previous)
		require.NoError(t, err)

		first := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append").usage(t)

		require.Equal(t, 1.0, counterValue(t, first), "stigg started the new window from zero")
		rolled := rolloverEventsOf(t, entitlement.Slug)
		require.Len(t, rolled, 1, "one window closed, and it was stigg's")
		require.NotNil(t, rolled[0].ResourceKey)
		require.Equal(t, "stigg", *rolled[0].ResourceKey)
		require.Equal(t, 6.0, rolled[0].Value)
		require.EqualValues(t, 3, rolled[0].EventCount)
		rows := resourceRows(t, instances[0].ID, entitlement.ID)
		require.Equal(t, "paid", rows[0].ResourceKey)
		require.True(t, rows[0].PeriodStart.Equal(previous), "paid has not reported: it still holds last month")
		require.True(t, rows[1].PeriodStart.Equal(current.Start))
		// The entitlement reads the new window's highest counter, not last month's.
		usage := getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)
		require.Equal(t, 1.0, counterValue(t, usage))
		require.EqualValues(t, 2, usage.Resources.Count)
		require.EqualValues(t, 0, usage.Resources.AtLimit)

		second := requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 2, "append").usage(t)

		require.Equal(t, 2.0, counterValue(t, second))
		require.Len(t, rolloverEventsOf(t, entitlement.Slug), 2, "paid rolled over on its own report")
		require.Equal(t, 2.0, counterValue(t, getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)))
		require.EqualValues(t, 9, counterReportSeq(t, instances[0].ID, entitlement.ID), "the pair's sequence moved once per accepted report")
	})

	t.Run("WhenARefusedReportRollsTheWindow_TheResetIsPersistedWithoutAReportNumber", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t, withPeriod(period.Month, period.Calendar))
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		current, err := period.Current(databaseNow(t), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.AddDate(0, -1, 0)
		seedResource(t, instances[0].ID, entitlement.ID, "stigg", 9, 3, &previous)
		_, err = testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO entitlement_usage (entitlement_id, instance_id, organization_id, value, period_start, report_seq)
			VALUES ($1, $2, $3, '{"type":"number","value":9,"event_count":3}'::jsonb, $4, 3)`,
			entitlement.ID, instances[0].ID, testDb.DefaultData.OrganizationID, previous)
		require.NoError(t, err)

		reportResource(t, instances[0].Slug, entitlement.Slug, "stigg", 11, "append").
			requireProblem(t, fiber.StatusConflict, "ReportEntitlementUsageMetric.ThresholdExceeded")

		rows := resourceRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		require.Equal(t, 0.0, rows[0].Value, "the closed window was reset, though the report was refused")
		require.True(t, rows[0].PeriodStart.Equal(current.Start))
		require.Len(t, rolloverEventsOf(t, entitlement.Slug), 1)
		require.EqualValues(t, 3, counterReportSeq(t, instances[0].ID, entitlement.ID), "a refused report takes no number")
		require.Empty(t, ledgerRows(t, instances[0].ID, entitlement.ID))
	})
}

func TestEntitlementResources_UsageHistory(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("TheJournalNamesTheResourceAndFiltersOnIt", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 2, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")
		path := reportsPath(instances[0].Slug, entitlement.Slug)

		all := historyGet(t, testServer.App, path, nil).page(t)
		filtered := historyGet(t, testServer.App, path, url.Values{"resourceKey": {"stigg"}}).page(t)
		none := historyGet(t, testServer.App, path, url.Values{"resourceKey": {"nobody"}}).page(t)

		require.Len(t, all.Items, 3)
		require.Equal(t, []string{"stigg", "paid", "stigg"}, resourceKeysOf(all.Items))
		require.Len(t, filtered.Items, 2)
		require.Equal(t, []int64{1, 3}, []int64{filtered.Items[0].ReportSeq, filtered.Items[1].ReportSeq}, "a resource's reports keep the pair's sequence")
		require.Equal(t, "0", filtered.Items[0].ValueBefore)
		require.Equal(t, "1", filtered.Items[1].ValueBefore, "value_before is the resource's own counter")
		require.Empty(t, none.Items)
	})

	t.Run("TheExportsGainTheResourceColumn", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		other := newEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, other.Slug, 10)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 1, "append")
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "paid", 2, "append")
		requireStatus(t, fiber.StatusOK, instances[0].Slug, other.Slug, 1, "append")

		pair := historyExport(t, "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage/reports/export", nil)
		filtered := historyExport(t, "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage/reports/export", url.Values{"resourceKey": {"paid"}})
		organization := historyExport(t, "/api/usage/reports/export", nil)

		require.Equal(t, "resource_key", pair[0][len(pair[0])-1], "the resource is the last column, so no reader of the others moves")
		require.Len(t, pair, 3)
		require.Equal(t, []string{"stigg", "paid"}, []string{pair[1][len(pair[1])-1], pair[2][len(pair[2])-1]})
		require.Len(t, filtered, 2)
		require.Equal(t, "paid", filtered[1][len(filtered[1])-1])
		require.Equal(t, "resource_key", organization[0][len(organization[0])-1])
		resourceCells := map[string]bool{}
		for _, row := range organization[1:] {
			resourceCells[row[len(row)-1]] = true
		}
		require.Equal(t, map[string]bool{"stigg": true, "paid": true, "": true}, resourceCells, "a report of an entitlement that counts per instance has an empty cell")
	})
}

// resourceKeysOf is the resource of each report; "" for one that names none.
func resourceKeysOf(items []usagehistory.UsageReport) []string {
	out := make([]string, len(items))
	for i, item := range items {
		if item.ResourceKey != nil {
			out[i] = *item.ResourceKey
		}
	}
	return out
}

// historyExport reads an export as CSV, header row included.
func historyExport(t *testing.T, path string, query url.Values) [][]string {
	t.Helper()
	if query == nil {
		query = url.Values{}
	}
	query.Set("format", "csv")
	got := sendResource(t, nil, http.MethodGet, path+"?"+query.Encode(), nil, nil)
	require.Equal(t, fiber.StatusOK, got.status, "body: %s", got.body)
	records, err := csv.NewReader(bytes.NewReader(got.body)).ReadAll()
	require.NoError(t, err)
	return records
}

func decodeBody[T any](t *testing.T, body []byte) T {
	t.Helper()
	var out T
	require.NoError(t, json.Unmarshal(body, &out))
	return out
}

func TestEntitlementResources_CascadeAndSeeders(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	// The subtests share one database, each on instances and entitlements of its own.
	t.Run("WhenTheInstanceIsDeleted_ItsResourceCountersGoWithIt", func(t *testing.T) {
		instances := newInstances(t, 2)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4) // both instances share one licence
		for _, instance := range instances {
			requireResourceReport(t, fiber.StatusOK, instance.Slug, entitlement.Slug, "stigg", 1, "append")
			requireResourceReport(t, fiber.StatusOK, instance.Slug, entitlement.Slug, "paid", 1, "append")
		}

		got := sendResource(t, nil, http.MethodDelete, "/api/instances/"+instances[0].Slug, nil, nil)

		require.Less(t, got.status, 300, "body: %s", got.body)
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID), "usage follows its instance out, like the pair's own row")
		require.Len(t, resourceRows(t, instances[1].ID, entitlement.ID), 2, "another instance's counters are untouched")
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 2, "the journal outlives the instance")
	})

	t.Run("WhenTheEntitlementIsDeleted_ItsResourceCountersGoWithIt", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		seedResource(t, instances[0].ID, entitlement.ID, "stigg", 2, 1, nil)
		seedResource(t, instances[0].ID, entitlement.ID, "paid", 1, 1, nil)

		got := sendResource(t, nil, http.MethodDelete, "/api/entitlements/"+entitlement.Slug, nil, nil)

		require.Less(t, got.status, 300, "body: %s", got.body)
		require.Empty(t, resourceRows(t, instances[0].ID, entitlement.ID), "usage follows its entitlement out")
	})

	t.Run("WhenASeederWritesASnapshot_APerResourceEntitlementIsRefused", func(t *testing.T) {
		instances := newInstances(t, 1)
		entitlement := newResourceEntitlement(t)
		assignHardLimit(t, instances[0].LicenseSlug, entitlement.Slug, 4)
		requireResourceReport(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, "stigg", 3, "append")

		err := reportentitlementusagemetric.WriteSnapshot(t.Context(), uow.NewUnitOfWork(testServer.Dependencies.DB), reportentitlementusagemetric.Snapshot{
			OrganizationID:  testDb.DefaultData.OrganizationID,
			InstanceSlug:    instances[0].Slug,
			EntitlementSlug: entitlement.Slug,
			Value:           9,
			EventCount:      5,
		})

		require.Error(t, err)
		require.Equal(t, "ReportEntitlementUsageMetric.ResourceKeyRequired", kaitenerrors.GetCode(err))
		require.Equal(t, map[string]float64{"stigg": 3}, resourceValues(t, instances[0].ID, entitlement.ID))
		require.Equal(t, 3.0, counterValue(t, getEntitlementUsage(t, instances[0].Slug, entitlement.Slug)),
			"the pair's row is still the summary of its resources, not a counter a seeder overwrote")
		require.Equal(t, []string{"stigg"}, ledgerResourceKeys(t, instances[0].ID, entitlement.ID), "no row was journalled for it")
	})
}

// rolloverEventsOf is the window closures of one entitlement.
func rolloverEventsOf(t *testing.T, entitlementSlug string) []reportentitlementusagemetric.InstanceEntitlementUsagePeriodRolledOver {
	t.Helper()
	var out []reportentitlementusagemetric.InstanceEntitlementUsagePeriodRolledOver
	for _, event := range rolloverEvents(t) {
		if event.EntitlementSlug == entitlementSlug {
			out = append(out, event)
		}
	}
	return out
}
