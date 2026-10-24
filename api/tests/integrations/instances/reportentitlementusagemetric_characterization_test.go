package instances_test

import (
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// This file characterizes the usage report and the two usage gauges exactly
// as they behave before the report is split into a pure planner and one
// write step. It pins what a refactor must not move: the stored counter, the
// exact response body, and the exact set of outbox events with their
// payloads, for every branch of the report -- lifetime and periodic, a stale
// window with one and with several closures, set and append over each of the
// six aggregations, hard, soft and unlimited grants, the exact reach, the cap
// and warning crossings fired once, and a refused report that writes nothing
// but its own event.
//
// Outbox rows written in one transaction share one occurred_at, so their
// order is not observable; events are compared as a sorted multiset.

type pinnedEvent struct {
	Name string
	Data string
}

// recordedEvents returns every outbox event of the default organization as
// (name, canonical JSON payload), sorted.
func recordedEvents(t *testing.T) []pinnedEvent {
	t.Helper()
	rows := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
	events := make([]pinnedEvent, 0, len(rows))
	for _, row := range rows {
		events = append(events, pinnedEvent{Name: row.EventName, Data: canonicalJSON(t, string(row.Data))})
	}
	sortEvents(events)
	return events
}

func requireEvents(t *testing.T, want ...pinnedEvent) {
	t.Helper()
	for i := range want {
		want[i].Data = canonicalJSON(t, want[i].Data)
	}
	sortEvents(want)
	require.Equal(t, want, recordedEvents(t))
}

func sortEvents(events []pinnedEvent) {
	slices.SortFunc(events, func(a, b pinnedEvent) int {
		if c := strings.Compare(a.Name, b.Name); c != 0 {
			return c
		}
		return strings.Compare(a.Data, b.Data)
	})
}

func canonicalJSON(t *testing.T, raw string) string {
	t.Helper()
	var v any
	require.NoError(t, json.Unmarshal([]byte(raw), &v), raw)
	out, err := json.Marshal(v)
	require.NoError(t, err)
	return string(out)
}

// readBody returns the response body as canonical JSON and closes it.
func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer commonfixture.MustCloseBody(t, resp.Body)
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return canonicalJSON(t, string(raw))
}

func getUsage(t *testing.T, instanceSlug, entitlementSlug string) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	return resp
}

func listUsage(t *testing.T, instanceSlug string) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+instanceSlug+"/entitlements/usage", nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	return resp
}

func newEntitlementForCharacterization(
	t *testing.T, aggregation entitlementschema.AggregationMethod, warningPercent int32, resetPeriod *period.ResetPeriod,
) *entitlementschema.Entitlement {
	t.Helper()
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	slug, err := slugutil.GenerateUnique("pin")
	require.NoError(t, err)
	input := createentitlement.CreateEntitlementInput{
		Name:                    "Pinned",
		Slug:                    slug,
		Type:                    entitlementschema.Number,
		AggregationMethod:       &aggregation,
		WarningThresholdPercent: warningPercent,
	}
	if resetPeriod != nil {
		input.ResetPeriod = resetPeriod
		input.ResetAnchor = ptr.To(period.Calendar)
	}
	entitlement, err := repo.CreateEntitlement(t.Context(), input, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	return entitlement
}

// usageJSON pins the complete gauge/event body for a direct licence grant.
// The expected limit and overage policy come from the fixture, not the response.
func usageJSON(t *testing.T, entitlementID, entitlementSlug, licenseID, licenseSlug string, value float64, eventCount int32, limit float64, overagePercent int16) string {
	t.Helper()
	body := map[string]any{
		"entitlementId":                  entitlementID,
		"entitlementSlug":                entitlementSlug,
		"licenseId":                      licenseID,
		"licenseSlug":                    licenseSlug,
		"value":                          map[string]any{"type": "number", "value": value},
		"limit":                          map[string]any{"type": "number", "value": limit},
		"limitCapExceededOveragePercent": overagePercent,
		"source":                         instanceschema.SourceLicense,
		"provenance":                     directLicenseProvenance(t, entitlementID, licenseID, map[string]any{"type": "number", "value": limit}, &overagePercent),
	}
	if eventCount != 0 {
		body["value"].(map[string]any)["event_count"] = eventCount
	}
	out, _ := json.Marshal(body)
	return string(out)
}

// The grant ID is random fixture identity; read it from the grant table, not
// from the effective view or response under test. Every contribution is pinned.
func directLicenseProvenance(t *testing.T, entitlementID, licenseID string, value map[string]any, overagePercent *int16) map[string]any {
	t.Helper()
	var grantID string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT id FROM license_entitlement WHERE entitlement_id=$1 AND license_id=$2`, entitlementID, licenseID).Scan(&grantID))
	return map[string]any{
		"license": map[string]any{"licenseEntitlementId": grantID, "value": value, "limitCapExceededOveragePercent": overagePercent},
		"addons":  []any{}, "boosts": []any{}, "exception": nil, "number": nil,
	}
}

func reportUsageJSON(t *testing.T, gaugeJSON string) string {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal([]byte(gaugeJSON), &body))
	require.NotContains(t, body, "transactionId", "gauges and usage events do not carry report replay metadata")
	body["transactionId"] = nil // These reports send no Idempotency-Key.
	return mustJSON(t, body)
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	out, err := json.Marshal(v)
	require.NoError(t, err)
	return string(out)
}

func TestUsageReportCharacterization_FoldsEveryAggregation(t *testing.T) {
	// From a stored {10, 2}, report 4.
	cases := []struct {
		aggregation    entitlementschema.AggregationMethod
		behavior       string
		wantValue      float64
		wantEventCount int32
	}{
		{entitlementschema.Count, "append", 11, 3},
		{entitlementschema.Sum, "append", 14, 3},
		{entitlementschema.Average, "append", 8, 3},
		{entitlementschema.Max, "append", 10, 3},
		{entitlementschema.Min, "append", 4, 3},
		{entitlementschema.Latest, "append", 4, 3},
		{entitlementschema.Count, "set", 4, 1},
		{entitlementschema.Sum, "set", 4, 1},
		{entitlementschema.Average, "set", 4, 1},
		{entitlementschema.Max, "set", 4, 1},
		{entitlementschema.Min, "set", 4, 1},
		{entitlementschema.Latest, "set", 4, 1},
	}
	for _, tc := range cases {
		t.Run(string(tc.aggregation)+"_"+tc.behavior, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance := newInstances(t, 1)[0]
			entitlement := newEntitlementForCharacterization(t, tc.aggregation, 0, nil)
			assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, -1, -1)
			seedUsageRow(t, instance.Slug, entitlement.Slug, 10, 2, nil)

			resp := reportUsage(t, instance.Slug, entitlement.Slug, 4, tc.behavior)
			require.Equal(t, fiber.StatusOK, resp.StatusCode)
			require.JSONEq(t,
				reportUsageJSON(t, usageJSON(t, entitlement.ID.String(), entitlement.Slug, instance.LicenseID.String(), instance.LicenseSlug, tc.wantValue, tc.wantEventCount, -1, -1)),
				readBody(t, resp))

			row := getUsageRow(t, instance.ID, entitlement.ID)
			stored, err := entitlementvalue.ParseNumberUsageValue(row.Value)
			require.NoError(t, err)
			require.Equal(t, tc.wantValue, stored.Value)
			require.Equal(t, tc.wantEventCount, stored.EventCount)
			require.False(t, row.PeriodStart.Valid, "a lifetime counter keeps a NULL period_start")

			requireEvents(t, pinnedEvent{
				Name: instanceEvents.EntitlementUsageReportAccepted.Name,
				Data: mustJSON(t, map[string]any{
					"entitlement_slug": entitlement.Slug, "value": 4, "behavior": tc.behavior,
					"event_count": tc.wantEventCount, "status": "ACCEPTED",
				}),
			})
		})
	}

	t.Run("FirstReport_FoldsAgainstTheZeroBaseline", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Min, 0, nil)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, -1, -1)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 4, "append")
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.JSONEq(t,
			reportUsageJSON(t, usageJSON(t, entitlement.ID.String(), entitlement.Slug, instance.LicenseID.String(), instance.LicenseSlug, 0, 1, -1, -1)),
			readBody(t, resp))
	})
}

func TestUsageReportCharacterization_Enforcement(t *testing.T) {
	t.Run("Hard_ExactReach_EmitsReachedAndWarningWithExactPayloads", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 80, nil)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 10, 0)
		seedUsageRow(t, instance.Slug, entitlement.Slug, 7, 1, nil)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 3, "append")
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		want := usageJSON(t, entitlement.ID.String(), entitlement.Slug, instance.LicenseID.String(), instance.LicenseSlug, 10, 2, 10, 0)
		require.JSONEq(t, reportUsageJSON(t, want), readBody(t, resp))

		requireEvents(
			t,
			pinnedEvent{Name: instanceEvents.EntitlementUsageReportAccepted.Name, Data: mustJSON(t, map[string]any{
				"entitlement_slug": entitlement.Slug, "value": 3, "behavior": "append", "event_count": 2, "status": "ACCEPTED",
			})},
			pinnedEvent{Name: instanceEvents.InstanceEntitlementUsageReached.Name, Data: want},
			pinnedEvent{Name: instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name, Data: mustJSON(t, map[string]any{
				"entitlement_slug": entitlement.Slug, "threshold": 10, "boundary": 8, "value": 10,
			})},
		)
	})

	t.Run("Hard_OverCap_RejectsWritesOnlyTheRejectedEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 80, nil)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 10, 0)
		seedUsageRow(t, instance.Slug, entitlement.Slug, 7, 1, nil)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 4, "append")
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)
		require.Contains(t, readBody(t, resp), `"code":"ReportEntitlementUsageMetric.ThresholdExceeded"`)

		stored, err := entitlementvalue.ParseNumberUsageValue(getUsageRow(t, instance.ID, entitlement.ID).Value)
		require.NoError(t, err)
		require.Equal(t, 7.0, stored.Value)
		require.EqualValues(t, 1, stored.EventCount)

		requireEvents(t, pinnedEvent{Name: instanceEvents.EntitlementUsageReportRejected.Name, Data: mustJSON(t, map[string]any{
			"entitlement_slug": entitlement.Slug, "value": 4, "behavior": "append", "event_count": 2, "status": "REJECTED",
		})})
	})

	t.Run("Soft_CrossesCapOnce_ThenRefusesPastTheMaximum", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 80, nil)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 10, 50) // maximum 15
		seedUsageRow(t, instance.Slug, entitlement.Slug, 7, 1, nil)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 5, "append")
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.JSONEq(t,
			reportUsageJSON(t, usageJSON(t, entitlement.ID.String(), entitlement.Slug, instance.LicenseID.String(), instance.LicenseSlug, 12, 2, 10, 50)),
			readBody(t, resp))
		requireEvents(
			t,
			pinnedEvent{Name: instanceEvents.EntitlementUsageReportAccepted.Name, Data: mustJSON(t, map[string]any{
				"entitlement_slug": entitlement.Slug, "value": 5, "behavior": "append", "event_count": 2, "status": "ACCEPTED",
			})},
			pinnedEvent{Name: instanceEvents.InstanceEntitlementCapExceeded.Name, Data: mustJSON(t, map[string]any{
				"entitlement_slug": entitlement.Slug, "threshold": 10, "value": 12, "overage": 2,
			})},
			pinnedEvent{Name: instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name, Data: mustJSON(t, map[string]any{
				"entitlement_slug": entitlement.Slug, "threshold": 10, "boundary": 8, "value": 12,
			})},
		)

		resp = reportUsage(t, instance.Slug, entitlement.Slug, 3, "append") // 15: exactly the maximum
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		readBody(t, resp)
		resp = reportUsage(t, instance.Slug, entitlement.Slug, 0.5, "append") // 15.5 > 15
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)
		readBody(t, resp)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
		require.Equal(t, 3, countOutboxEvents(t, instanceEvents.EntitlementUsageReportAccepted.Name)+countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))

		stored, err := entitlementvalue.ParseNumberUsageValue(getUsageRow(t, instance.ID, entitlement.ID).Value)
		require.NoError(t, err)
		require.Equal(t, 15.0, stored.Value)
	})

	t.Run("Unlimited_EmitsOnlyTheAcceptedEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 80, nil)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, -1, -1)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 1_000_000, "append")
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		readBody(t, resp)
		requireEvents(t, pinnedEvent{Name: instanceEvents.EntitlementUsageReportAccepted.Name, Data: mustJSON(t, map[string]any{
			"entitlement_slug": entitlement.Slug, "value": 1_000_000, "behavior": "append", "event_count": 1, "status": "ACCEPTED",
		})})
	})

	t.Run("NumericSet_OnACreditPool_IsRefusedByD8", func(t *testing.T) {
		// Pinned so the change that makes credit pools append-only is a
		// deliberate, visible diff rather than a silent one.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 100, 0)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 40, "set")
		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
		require.Contains(t, readBody(t, resp), "ReportEntitlementUsageMetric.AiCreditPoolAppendOnly")
	})
}

func TestUsageReportCharacterization_Periodic(t *testing.T) {
	month := period.Month
	currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)

	periodicUsageJSON := func(entitlementID, entitlementSlug, licenseID, licenseSlug string, value float64, eventCount int32, limit float64) string {
		var body map[string]any
		require.NoError(t, json.Unmarshal([]byte(usageJSON(t, entitlementID, entitlementSlug, licenseID, licenseSlug, value, eventCount, limit, 0)), &body))
		body["currentPeriodStart"] = currentWindow.Start.Format(time.RFC3339)
		body["currentPeriodEnd"] = currentWindow.End.Format(time.RFC3339)
		return mustJSON(t, body)
	}

	t.Run("StaleByThreeWindows_ClosesThreeInOneBatchThenAppends", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 0, &month)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 100, 0)
		staleStart := currentWindow.Start.AddDate(0, -3, 0)
		seedUsageRow(t, instance.Slug, entitlement.Slug, 50, 2, &staleStart)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 6, "append")
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.JSONEq(t,
			reportUsageJSON(t, periodicUsageJSON(entitlement.ID.String(), entitlement.Slug, instance.LicenseID.String(), instance.LicenseSlug, 6, 1, 100)),
			readBody(t, resp))

		closure := func(start time.Time, value float64, eventCount int32, synthetic bool) pinnedEvent {
			end := start.AddDate(0, 1, 0)
			return pinnedEvent{Name: instanceEvents.InstanceEntitlementUsagePeriodRolledOver.Name, Data: mustJSON(t, map[string]any{
				"entitlement_id": entitlement.ID, "entitlement_slug": entitlement.Slug, "instance_id": instance.ID,
				"value": value, "event_count": eventCount,
				"closed_period_start": start.Format(time.RFC3339), "closed_period_end": end.Format(time.RFC3339),
				"new_period_start": end.Format(time.RFC3339), "is_synthetic": synthetic, "reason": "PERIOD_ENDED",
			})}
		}
		requireEvents(
			t,
			closure(staleStart, 50, 2, false),
			closure(staleStart.AddDate(0, 1, 0), 0, 0, true),
			closure(staleStart.AddDate(0, 2, 0), 0, 0, true),
			pinnedEvent{Name: instanceEvents.EntitlementUsageReportAccepted.Name, Data: mustJSON(t, map[string]any{
				"entitlement_slug": entitlement.Slug, "value": 6, "behavior": "append", "event_count": 1, "status": "ACCEPTED",
			})},
		)

		row := getUsageRow(t, instance.ID, entitlement.ID)
		require.True(t, row.PeriodStart.Time.Equal(currentWindow.Start))
	})

	t.Run("StaleByOneWindow_RejectedReport_KeepsTheRollover", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 0, &month)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 10, 0)
		staleStart := currentWindow.Start.AddDate(0, -1, 0)
		seedUsageRow(t, instance.Slug, entitlement.Slug, 9, 3, &staleStart)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 11, "append")
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)
		readBody(t, resp)

		row := getUsageRow(t, instance.ID, entitlement.ID)
		stored, err := entitlementvalue.ParseNumberUsageValue(row.Value)
		require.NoError(t, err)
		require.Equal(t, 0.0, stored.Value)
		require.EqualValues(t, 0, stored.EventCount)
		require.True(t, row.PeriodStart.Time.Equal(currentWindow.Start))

		requireEvents(
			t,
			pinnedEvent{Name: instanceEvents.InstanceEntitlementUsagePeriodRolledOver.Name, Data: mustJSON(t, map[string]any{
				"entitlement_id": entitlement.ID, "entitlement_slug": entitlement.Slug, "instance_id": instance.ID,
				"value": 9, "event_count": 3,
				"closed_period_start": staleStart.Format(time.RFC3339), "closed_period_end": currentWindow.Start.Format(time.RFC3339),
				"new_period_start": currentWindow.Start.Format(time.RFC3339), "is_synthetic": false, "reason": "PERIOD_ENDED",
			})},
			pinnedEvent{Name: instanceEvents.EntitlementUsageReportRejected.Name, Data: mustJSON(t, map[string]any{
				"entitlement_slug": entitlement.Slug, "value": 11, "behavior": "append", "event_count": 1, "status": "REJECTED",
			})},
		)
	})

	t.Run("CrossingsReArmAfterRollover", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 50, &month)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 10, 0)
		staleStart := currentWindow.Start.AddDate(0, -1, 0)
		seedUsageRow(t, instance.Slug, entitlement.Slug, 10, 3, &staleStart) // the closed window sat at its cap

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 10, "append")
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		readBody(t, resp)
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
	})
}

func TestUsageGaugeCharacterization(t *testing.T) {
	month := period.Month
	currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)

	t.Run("BothGauges_ExactBodies_LifetimeStalePeriodicAndBoolean", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		lifetime := newEntitlementForCharacterization(t, entitlementschema.Sum, 0, nil)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, lifetime.Slug, 100, 0)
		seedUsageRow(t, instance.Slug, lifetime.Slug, 42, 5, nil)

		periodic := newEntitlementForCharacterization(t, entitlementschema.Sum, 0, &month)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, periodic.Slug, 100, 20)
		staleStart := currentWindow.Start.AddDate(0, -1, 0)
		seedUsageRow(t, instance.Slug, periodic.Slug, 77, 3, &staleStart)

		boolean := newEntitlementWithType(t, entitlementschema.Boolean)
		assignBooleanEntitlementToLicense(t, instance.LicenseSlug, boolean.Slug, true)

		lifetimeWant := usageJSON(t, lifetime.ID.String(), lifetime.Slug, instance.LicenseID.String(), instance.LicenseSlug, 42, 5, 100, 0)

		var periodicBody map[string]any
		require.NoError(t, json.Unmarshal([]byte(usageJSON(t, periodic.ID.String(), periodic.Slug, instance.LicenseID.String(), instance.LicenseSlug, 0, 0, 100, 20)), &periodicBody))
		periodicBody["currentPeriodStart"] = currentWindow.Start.Format(time.RFC3339)
		periodicBody["currentPeriodEnd"] = currentWindow.End.Format(time.RFC3339)
		periodicWant := mustJSON(t, periodicBody)

		booleanWant := mustJSON(t, map[string]any{
			"entitlementId": boolean.ID, "entitlementSlug": boolean.Slug,
			"licenseId": instance.LicenseID, "licenseSlug": instance.LicenseSlug,
			"value":      map[string]any{"type": "boolean", "value": true},
			"limit":      map[string]any{"type": "boolean", "value": true},
			"source":     instanceschema.SourceLicense,
			"provenance": directLicenseProvenance(t, boolean.ID.String(), instance.LicenseID.String(), map[string]any{"type": "boolean", "value": true}, nil),
		})

		resp := getUsage(t, instance.Slug, lifetime.Slug)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.JSONEq(t, lifetimeWant, readBody(t, resp))

		resp = getUsage(t, instance.Slug, periodic.Slug)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.JSONEq(t, periodicWant, readBody(t, resp), "a stale row reads as the new window's zero")

		resp = getUsage(t, instance.Slug, boolean.Slug)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.JSONEq(t, booleanWant, readBody(t, resp))

		resp = listUsage(t, instance.Slug)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		var items []json.RawMessage
		require.NoError(t, json.Unmarshal([]byte(readBody(t, resp)), &items))
		got := make([]string, 0, len(items))
		for _, item := range items {
			got = append(got, canonicalJSON(t, string(item)))
		}
		want := []string{canonicalJSON(t, lifetimeWant), canonicalJSON(t, periodicWant), canonicalJSON(t, booleanWant)}
		require.ElementsMatch(t, want, got)

		// The reads never wrote: the stale row is still in its old window.
		row := getUsageRow(t, instance.ID, periodic.ID)
		require.True(t, row.PeriodStart.Time.Equal(staleStart))

		// The single gauge writes its read-audit event; the list does not.
		require.Equal(t, 3, countOutboxEvents(t, instanceEvents.EntitlementValueGet.Name))
		require.Len(t, recordedEvents(t), 3)
	})

	t.Run("Report_AndGauge_AnswerTheSameBody", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlementForCharacterization(t, entitlementschema.Sum, 0, &month)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 100, 0)

		resp := reportUsage(t, instance.Slug, entitlement.Slug, 12.5, "append")
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		reported := readBody(t, resp)

		resp = getUsage(t, instance.Slug, entitlement.Slug)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.JSONEq(t, reported, reportUsageJSON(t, readBody(t, resp)), "only the report adds the explicitly null transactionId")

		var body instanceschema.EntitlementUsage
		require.NoError(t, json.Unmarshal([]byte(reported), &body))
		require.Equal(t, 12.5, body.Value.Number.Value)
	})
}
