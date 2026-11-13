package instances_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	fixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

type deniedAIReporter struct{ calls int }

func (r *deniedAIReporter) TrackAsync(uuid.UUID, string)     { r.calls++ }
func (r *deniedAIReporter) DecrementAsync(uuid.UUID, string) { r.calls++ }
func (r *deniedAIReporter) ReportAndEnforce(context.Context, uuid.UUID, string) error {
	r.calls++
	return nil
}

func (r *deniedAIReporter) Decrement(context.Context, uuid.UUID, string) error { r.calls++; return nil }

// Uses the existing disposable integration fixture. Do not run this suite
// against an existing workshop database or as part of an implicit reseed.
func TestAIShutdownRefusesAdmissionButRecordsSettlementAndNumericEvidence(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	reserve := aiUsageBody("reserve", "completed", 2)
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), 200)
	commit := aiUsageBody("commit", "completed", 2)
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), 200)
	held := aiUsageBody("reserve", "held", 1)
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, held), 200)
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "released", 1)), 200)
	release := aiUsageBody("commit", "released", 0)
	release["requestStatus"] = "NOT_SENT"
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, release), 200)
	require.Equal(t, 200, reportWithKey(t, nil, instance.Slug, pool.Slug, "1", "append", "numeric-existing").status)

	reporter := &deniedAIReporter{}
	off := tests.NewTestServer(testDb, tests.TestServerOptions{UsageReporter: reporter})
	t.Cleanup(func() { require.NoError(t, off.Close()) })
	seq, journal, events := counterReportSeq(t, instance.ID, pool.ID), ledgerRows(t, instance.ID, pool.ID), recordedEvents(t)
	operations := func() string {
		var snapshot string
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id), '[]'::jsonb)::text FROM ai_inference a WHERE organization_id=$1 AND instance_id=$2 AND entitlement_id=$3`, testDb.DefaultData.OrganizationID, instance.ID, pool.ID).Scan(&snapshot))
		return snapshot
	}
	status := func(transactionID string) (status string) {
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT status::text FROM ai_inference WHERE organization_id=$1 AND instance_id=$2 AND entitlement_id=$3 AND transaction_id=$4`, testDb.DefaultData.OrganizationID, instance.ID, pool.ID, transactionID).Scan(&status))
		return status
	}
	beforeOperations := operations()
	path := "/api/instances/" + instance.Slug + "/entitlements/" + pool.Slug + "/usage"
	post := func(body map[string]any) *http.Response {
		response, err := off.App.Test(fixture.NewJSONRequest(t, http.MethodPost, path, map[string]any{"value": body}), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { fixture.MustCloseBody(t, response.Body) })
		return response
	}

	// Admission stays closed: a new reservation, and the replay of an open one.
	for _, body := range []map[string]any{aiUsageBody("reserve", "fresh-reserve", 1), held} {
		problem := fixture.AssertJSONResponse[apierrors.Problem](t, post(body), 403)
		require.Equal(t, "AIUsage.Disabled", problem.Code)
	}
	for _, suffix := range []string{"", "/inferences", "/reservations"} {
		response, err := off.App.Test(fixture.NewJSONRequest(t, http.MethodGet, path+suffix, nil), fiber.TestConfig{})
		require.NoError(t, err)
		require.Equal(t, 403, response.StatusCode)
		fixture.MustCloseBody(t, response.Body)
	}
	require.Equal(t, seq, counterReportSeq(t, instance.ID, pool.ID))
	require.Equal(t, journal, ledgerRows(t, instance.ID, pool.ID))
	require.Equal(t, events, recordedEvents(t))
	require.Equal(t, beforeOperations, operations(), "a refusal writes nothing")

	// Evidence is recorded: an inference that ran without a reservation, the
	// release of an open hold, and both exact replays.
	fresh := aiUsageBody("commit", "fresh", 1)
	fresh["model"], fresh["requestType"] = "lifecycle-model", "COMPLETION"
	unsent := aiUsageBody("commit", "held", 0)
	unsent["requestStatus"] = "NOT_SENT"
	charged := post(fresh)
	require.Empty(t, charged.Header.Get("Idempotent-Replayed"))
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, charged, 200)
	require.Equal(t, "COMMITTED", status("fresh"))
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, post(unsent), 200)
	require.Equal(t, "RELEASED", status("held"))
	for _, body := range []map[string]any{commit, release, fresh} {
		replayed := post(body)
		require.Equal(t, "true", replayed.Header.Get("Idempotent-Replayed"))
		fixture.AssertJSONResponse[schema.EntitlementUsage](t, replayed, 200)
	}
	// So are numeric adjustments of the pool, the refund included, and their replay.
	for _, value := range []string{"1", "-1"} {
		require.Equal(t, 200, reportWithKey(t, off.App, instance.Slug, pool.Slug, value, "append", "fresh-numeric-"+value).status)
	}
	existing := reportWithKey(t, off.App, instance.Slug, pool.Slug, "1", "append", "numeric-existing")
	require.Equal(t, 200, existing.status)
	require.Equal(t, "true", existing.replayed)
	journal = ledgerRows(t, instance.ID, pool.ID)
	require.Greater(t, counterReportSeq(t, instance.ID, pool.ID), seq)
	require.Zero(t, reporter.calls, "known AI still counts nothing in dogfooding while off")
	beforeOperations = operations()

	// The immutable invoice-linked journal remains a read-only financial path,
	// even though the live gauge and inference/reservation history are denied.
	response, err := off.App.Test(fixture.NewJSONRequest(t, http.MethodGet, path+"/reports", nil), fiber.TestConfig{})
	require.NoError(t, err)
	require.Equal(t, 200, response.StatusCode)
	var page struct {
		Items []json.RawMessage `json:"items"`
	}
	require.NoError(t, json.NewDecoder(response.Body).Decode(&page))
	fixture.MustCloseBody(t, response.Body)
	require.Len(t, page.Items, len(journal))
	require.Equal(t, beforeOperations, operations())
}

func TestAIShutdownRefusesFamilyCopyBeforeVersionAndOutboxWrites(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, _ := newAIUsagePair(t, 100)
	off := tests.NewTestServer(testDb)
	t.Cleanup(func() { require.NoError(t, off.Close()) })
	var family uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT family_id FROM license WHERE id=$1`, instance.LicenseID).Scan(&family))
	var before int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM license WHERE family_id=$1`, family).Scan(&before))
	events := recordedEvents(t)
	response, err := off.App.Test(fixture.NewJSONRequest(t, http.MethodPost, "/api/licenses", map[string]any{"familyId": family, "name": "Ordinary-looking copy", "description": "copy", "type": "DEVELOPMENT", "lifecycleState": "DRAFT", "isDefault": false}), fiber.TestConfig{})
	require.NoError(t, err)
	problem := fixture.AssertJSONResponse[apierrors.Problem](t, response, 403)
	fixture.MustCloseBody(t, response.Body)
	require.Equal(t, "AIUsage.Disabled", problem.Code)
	var after int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM license WHERE family_id=$1`, family).Scan(&after))
	require.Equal(t, before, after)
	require.Equal(t, events, recordedEvents(t))
}

func TestEnabledAIStillRequiresScopeAndTenantIdentity(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	for _, options := range []tests.TestServerOptions{
		{Scopes: []string{"read:models"}},
		{OrganizationID: new(uuid.New())},
	} {
		options.PlatformFlags = aitest.Flags(true)
		scoped := tests.NewTestServer(testDb, options)
		t.Cleanup(func() { require.NoError(t, scoped.Close()) })
		response, err := scoped.App.Test(fixture.NewJSONRequest(t, http.MethodPost, "/api/instances/"+instance.Slug+"/entitlements/"+pool.Slug+"/usage", map[string]any{"value": aiUsageBody("reserve", "unauthorized", 1)}), fiber.TestConfig{})
		require.NoError(t, err)
		require.Contains(t, []int{403, 404}, response.StatusCode)
		fixture.MustCloseBody(t, response.Body)
	}
	require.Empty(t, ledgerRows(t, instance.ID, pool.ID))
}
