package instances_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func aiReport(t *testing.T, instance, pool string, value map[string]any, headers ...map[string]string) *http.Response {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instance+"/entitlements/"+pool+"/usage", map[string]any{"value": value}, headers...), fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func TestAIUsageReserveCommitAndReplay(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance := newInstances(t, 1)[0]
	pool, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{Name: "AI Credits", Slug: "ai-credits", Type: entitlementschema.NumberAICredit, AggregationMethod: ptr.To(entitlementschema.Sum)}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, pool.Slug, 5, 0)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `WITH m AS (
		INSERT INTO model (organization_id,name,slug,vendor,modality,created_by_id,updated_by_id)
		VALUES ($1,'Synthetic','synthetic-model','synthetic','TEXT',$2,$2) RETURNING id)
		INSERT INTO credit_conversion_rule (organization_id,license_id,entitlement_id,model_id,rate_per_output_token,created_by_id,updated_by_id)
		SELECT $1,$3,$4,id,1,$2,$2 FROM m`, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, instance.LicenseID, pool.ID)
	require.NoError(t, err)
	reserve := map[string]any{"type": "ai_usage", "phase": "reserve", "transactionId": "tx-one", "model": "synthetic-model", "requestType": "COMPLETION", "usage": map[string]any{"outputTokens": 5}}
	granted := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	require.Equal(t, "RESERVED", granted.AI.Status)
	require.Equal(t, "5", *granted.Reserved)
	require.Zero(t, granted.Value.Number.Value)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	refused := map[string]any{"type": "ai_usage", "phase": "reserve", "transactionId": "tx-two", "model": "synthetic-model", "requestType": "COMPLETION", "usage": map[string]any{"outputTokens": 1}}
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, refused), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)
	commit := map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "tx-one", "requestStatus": "SUCCESS", "usage": map[string]any{"outputTokens": 7}}
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.Equal(t, 7.0, charged.Value.Number.Value)
	require.Equal(t, "0", *charged.Reserved)
	require.Contains(t, charged.AI.Warnings, "OVERDRAWN")
	replayResponse := aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", replayResponse.Header.Get("Idempotent-Replayed"))
	replayed := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replayResponse, http.StatusOK)
	require.Equal(t, charged, replayed)
	var count int
	var before, after, amount float64
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*),max(value_before),max(value_after),max(credits_charged)::float8 FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&count, &before, &after, &amount))
	require.Equal(t, 1, count)
	require.InDelta(t, amount, after-before, 0.0000005)
	commit["usage"] = map[string]any{"outputTokens": 8}
	problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
}

func TestAIHistoryAndRelease(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance := newInstances(t, 1)[0]
	pool, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{Name: "Credits", Slug: "history-credits", Type: entitlementschema.NumberAICredit, AggregationMethod: ptr.To(entitlementschema.Sum)}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, pool.Slug, 100, 0)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `WITH m AS (INSERT INTO model (organization_id,name,slug,vendor,modality,created_by_id,updated_by_id) VALUES ($1,'Synthetic','history-model','v','TEXT',$2,$2) RETURNING id) INSERT INTO credit_conversion_rule (organization_id,license_id,entitlement_id,model_id,rate_per_request,charge_on_error,created_by_id,updated_by_id) SELECT $1,$3,$4,id,2,'ALWAYS',$2,$2 FROM m`, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, instance.LicenseID, pool.ID)
	require.NoError(t, err)
	reserve := map[string]any{"type": "ai_usage", "phase": "reserve", "transactionId": "history-tx", "model": "history-model", "requestType": "COMPLETION"}
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	base := "/api/instances/" + instance.Slug + "/entitlements/" + pool.Slug + "/usage"
	get := func(path string) *http.Response {
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", path, nil), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		return resp
	}
	open := commonfixture.AssertJSONResponse[instanceschema.AiReservations](t, get(base+"/reservations"), http.StatusOK)
	require.Len(t, open.Items, 1)
	gauge := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, get(base), http.StatusOK)
	require.Equal(t, "2", *gauge.Reserved)
	beforeEvents := recordedEvents(t)
	history := commonfixture.AssertJSONResponse[instanceschema.AiInferencePage](t, get(base+"/inferences"), http.StatusOK)
	require.Len(t, history.Items, 1)
	require.Equal(t, "RESERVED", history.Items[0].Status)
	require.Equal(t, beforeEvents, recordedEvents(t))
	released := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "history-tx", "requestStatus": "NOT_SENT"}), http.StatusOK)
	require.Equal(t, "RELEASED", released.AI.Status)
	require.Equal(t, "0", *released.AI.Credits.Charged)
	require.Zero(t, released.Value.Number.Value)
	open = commonfixture.AssertJSONResponse[instanceschema.AiReservations](t, get(base+"/reservations"), http.StatusOK)
	require.Empty(t, open.Items)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
}

func TestAICommitRecordsUnknownModelAndDeduplicatesUnauthorizedEvent(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance := newInstances(t, 1)[0]
	pool := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, pool.Slug, 10, 0)
	for _, id := range []string{"unknown-one", "unknown-two"} {
		response := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": id, "model": "missing-model", "requestType": "COMPLETION", "requestStatus": "SUCCESS", "usage": map[string]any{"inputTokens": 123}}), http.StatusOK)
		require.False(t, *response.AI.Authorized)
		require.Contains(t, response.AI.Warnings, "UNKNOWN_MODEL")
		require.Equal(t, "0", *response.AI.Credits.Charged)
		require.Zero(t, response.Value.Number.Value)
	}
	var operations, eventCount int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference WHERE entitlement_id=$1 AND denial_reason='UNKNOWN_MODEL'`, pool.ID).Scan(&operations))
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM outbox_events WHERE organization_id=$1 AND event_name='INSTANCE_AI_MODEL_USAGE_UNAUTHORIZED'`, testDb.DefaultData.OrganizationID).Scan(&eventCount))
	require.Equal(t, 2, operations)
	require.Equal(t, 1, eventCount)
}

// newAIUsagePair builds on the existing grant fixture; individual lifecycle
// tests only change the rule or reset period when their scenario needs it.
func newAIUsagePair(t *testing.T, limit int32) (*instanceschema.Instance, *entitlementschema.Entitlement) {
	t.Helper()
	instance := newInstances(t, 1)[0]
	pool := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 80)
	overagePercent := entitlementvalue.DefaultLimitCapExceededOveragePercent(float64(limit))
	assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, pool.Slug, limit, overagePercent)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `WITH m AS (
		INSERT INTO model (organization_id,name,slug,vendor,modality,created_by_id,updated_by_id)
		VALUES ($1,'Lifecycle','lifecycle-model','synthetic','TEXT',$2,$2) RETURNING id)
		INSERT INTO credit_conversion_rule (organization_id,license_id,entitlement_id,model_id,rate_per_output_token,charge_on_error,created_by_id,updated_by_id)
		SELECT $1,$3,$4,id,1,'ALWAYS',$2,$2 FROM m`, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, instance.LicenseID, pool.ID)
	require.NoError(t, err)
	return instance, pool
}

func aiUsageBody(phase, id string, tokens int) map[string]any {
	value := map[string]any{"type": "ai_usage", "phase": phase, "transactionId": id, "usage": map[string]any{"outputTokens": tokens}}
	if phase == "reserve" {
		value["model"], value["requestType"] = "lifecycle-model", "COMPLETION"
	} else {
		value["requestStatus"] = "SUCCESS"
	}
	return value
}

func aiRead(t *testing.T, instance, pool, suffix string) *http.Response {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+instance+"/entitlements/"+pool+"/usage"+suffix, nil), fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

// Build requests and perform assertions on the test goroutine, never FailNow
// inside a worker. Both requests start together and have bounded lifetimes.
func concurrentAIReports(t *testing.T, instance, pool string, values ...map[string]any) []*http.Response {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 35*time.Second)
	defer cancel()
	type result struct {
		response *http.Response
		err      error
	}
	results := make(chan result, len(values))
	ready := make(chan struct{}, len(values))
	start := make(chan struct{})
	for _, value := range values {
		request := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instance+"/entitlements/"+pool+"/usage", map[string]any{"value": value}).WithContext(ctx)
		go func() {
			ready <- struct{}{}
			<-start
			response, err := testServer.App.Test(request, fiber.TestConfig{Timeout: 30 * time.Second})
			results <- result{response: response, err: err}
		}()
	}
	for range values {
		<-ready
	}
	close(start)
	responses := make([]*http.Response, 0, len(values))
	for range values {
		select {
		case result := <-results:
			require.NoError(t, result.err)
			t.Cleanup(func() { commonfixture.MustCloseBody(t, result.response.Body) })
			responses = append(responses, result.response)
		case <-ctx.Done():
			t.Fatal("concurrent AI reports exceeded deadline")
		}
	}
	return responses
}

func TestAIConcurrentLastCreditReserves(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 1)
	beforeEvents := recordedEvents(t)
	responses := concurrentAIReports(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "last-one", 1), aiUsageBody("reserve", "last-two", 1))
	accepted, refused := 0, 0
	for _, response := range responses {
		if response.StatusCode == http.StatusOK {
			accepted++
			granted := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, response, http.StatusOK)
			require.Equal(t, "1", *granted.Reserved)
			require.Zero(t, granted.Value.Number.Value)
		} else {
			refused++
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, response, http.StatusConflict)
			require.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)
		}
	}
	require.Equal(t, 1, accepted)
	require.Equal(t, 1, refused)
	var operations, usageRows int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference WHERE instance_id=$1 AND entitlement_id=$2 AND status='RESERVED'`, instance.ID, pool.ID).Scan(&operations))
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM entitlement_usage WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&usageRows))
	require.Equal(t, 1, operations)
	require.Zero(t, usageRows, "reserve must not create a consumed-credit counter")
	afterEvents := recordedEvents(t)
	require.Len(t, afterEvents, len(beforeEvents)+1, "only the refused request may emit an event")
	open := commonfixture.AssertJSONResponse[instanceschema.AiReservations](t, aiRead(t, instance.Slug, pool.Slug, "/reservations"), http.StatusOK)
	require.Len(t, open.Items, 1)
}

func TestAIConcurrentIdenticalCommitsChargeOnce(t *testing.T) {
	for _, reserved := range []bool{false, true} {
		name := "bare commit"
		if reserved {
			name = "reserved commit"
		}
		t.Run(name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance, pool := newAIUsagePair(t, 1)
			if reserved {
				commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "same-commit", 1)), http.StatusOK)
			}
			commit := aiUsageBody("commit", "same-commit", 2)
			if !reserved {
				commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
			}
			beforeEvents := recordedEvents(t)
			responses := concurrentAIReports(t, instance.Slug, pool.Slug, commit, commit)
			var original *instanceschema.EntitlementUsage
			replays := 0
			for _, response := range responses {
				if response.Header.Get("Idempotent-Replayed") == "true" {
					replays++
				}
				charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, response, http.StatusOK)
				require.Equal(t, 2.0, charged.Value.Number.Value)
				require.Equal(t, int32(1), charged.Value.Number.EventCount)
				require.Equal(t, "2", *charged.AI.Credits.Charged)
				require.Equal(t, "0", *charged.Reserved)
				require.Contains(t, charged.AI.Warnings, "OVERDRAWN")
				if original == nil {
					original = &charged
				} else {
					require.Equal(t, *original, charged)
				}
			}
			require.Equal(t, 1, replays)
			var count int
			var charged, before, after float64
			require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*),sum(credits_charged)::float8,min(value_before),max(value_after) FROM ai_inference WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&count, &charged, &before, &after))
			require.Equal(t, 1, count)
			require.Equal(t, 2.0, charged)
			require.InDelta(t, charged, after-before, 0.0000005)
			row := getUsageRow(t, instance.ID, pool.ID)
			counter, err := entitlementvalue.ParseNumberUsageValue(row.Value)
			require.NoError(t, err)
			require.Equal(t, 2.0, counter.Value)
			require.Equal(t, int32(1), counter.EventCount)
			afterEvents := recordedEvents(t)
			require.Len(t, afterEvents, len(beforeEvents)+3, "one accepted report and one warning/cap crossing, no replay events")
		})
	}
}

func TestAIExpiredReservationIgnoredBeforeSweepAndLateCommitChargedInFull(t *testing.T) {
	for _, swept := range []bool{false, true} {
		name := "before sweep"
		if swept {
			name = "after sweep"
		}
		t.Run(name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance, pool := newAIUsagePair(t, 5)
			beforeEvents := recordedEvents(t)
			reserve := aiUsageBody("reserve", "expired", 5)
			commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
			require.Equal(t, beforeEvents, recordedEvents(t), "granted reservation emits no usage event")
			_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE ai_inference SET expires_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute' WHERE entitlement_id=$1`, pool.ID)
			require.NoError(t, err)
			if swept {
				expired, err := instancedb.New(testServer.Dependencies.DB).ExpireAIReservations(t.Context())
				require.NoError(t, err)
				require.Len(t, expired, 1)
				require.Equal(t, beforeEvents, recordedEvents(t), "expiry is bookkeeping, not a money write")
			}
			var status string
			require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT status::text FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&status))
			if swept {
				require.Equal(t, "EXPIRED", status)
			} else {
				require.Equal(t, "RESERVED", status, "the gate must ignore expiry before any status sweep")
			}
			gauge := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiRead(t, instance.Slug, pool.Slug, ""), http.StatusOK)
			require.Equal(t, "0", *gauge.Reserved)
			require.Zero(t, gauge.Value.Number.Value)
			open := commonfixture.AssertJSONResponse[instanceschema.AiReservations](t, aiRead(t, instance.Slug, pool.Slug, "/reservations"), http.StatusOK)
			require.Empty(t, open.Items)
			commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "replacement", 5)), http.StatusOK)
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusConflict)
			require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
			commit := aiUsageBody("commit", "expired", 7)
			charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
			require.Contains(t, charged.AI.Warnings, "RESERVATION_EXPIRED")
			require.Contains(t, charged.AI.Warnings, "OVERDRAWN")
			require.Equal(t, "7", *charged.AI.Credits.Charged)
			require.Equal(t, 7.0, charged.Value.Number.Value)
			require.Equal(t, "5", *charged.Reserved, "late commit must not subtract another open reservation")
			beforeReplayEvents := recordedEvents(t)
			response := aiReport(t, instance.Slug, pool.Slug, commit)
			require.Equal(t, "true", response.Header.Get("Idempotent-Replayed"))
			require.Equal(t, charged, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, response, http.StatusOK))
			require.Equal(t, beforeReplayEvents, recordedEvents(t))
		})
	}
}

func TestAIReleasedOperationIsSettledAndReplaysOnlyIdenticalNotSent(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 10)
	reserve := aiUsageBody("reserve", "released", 5)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	commit := aiUsageBody("commit", "released", 5)
	commit["requestStatus"] = "NOT_SENT"
	beforeEvents := recordedEvents(t)
	released := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.Equal(t, "RELEASED", released.AI.Status)
	require.Equal(t, "0", *released.AI.Credits.Charged, "NOT_SENT ignores charge_on_error=ALWAYS")
	require.Zero(t, released.Value.Number.Value)
	require.Equal(t, "0", *released.Reserved)
	beforeRow := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID)
	response := aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", response.Header.Get("Idempotent-Replayed"))
	require.Equal(t, released, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, response, http.StatusOK))
	// Adopted D1 close-once overrides DEV_PROMPT D5 lines 375-376, which
	// incorrectly also permit charging an already RELEASED operation.
	commit["requestStatus"] = "SUCCESS"
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
	require.Equal(t, beforeRow, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID))
	require.Equal(t, beforeEvents, recordedEvents(t))
	var usageRows int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM entitlement_usage WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&usageRows))
	require.Zero(t, usageRows)
}

func TestAIStaleWindowReplayWritesNoCounterOperationOrOutbox(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE entitlement SET reset_period='MONTH',reset_anchor='CALENDAR' WHERE id=$1`, pool.ID)
	require.NoError(t, err)
	commit := aiUsageBody("commit", "stale-replay", 2)
	commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
	original := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	// Simulate the original response belonging to the previous window while
	// retaining its operation inside the idempotency horizon.
	previousStart := original.CurrentPeriodStart.AddDate(0, -1, 0)
	previousEnd := *original.CurrentPeriodStart
	original.CurrentPeriodStart, original.CurrentPeriodEnd = &previousStart, &previousEnd
	storedResponse, err := json.Marshal(original)
	require.NoError(t, err)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE ai_inference SET window_start=$2,commit_response=$3::jsonb WHERE entitlement_id=$1`, pool.ID, previousStart, storedResponse)
	require.NoError(t, err)
	seedUsageRow(t, instance.Slug, pool.Slug, 777, 9, &previousStart)
	counterBefore := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(e),'xmin',e.xmin::text) FROM entitlement_usage e WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID)
	operationBefore := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID)
	beforeEvents := recordedEvents(t)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET rate_per_output_token=99 WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	response := aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", response.Header.Get("Idempotent-Replayed"))
	replayed := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, response, http.StatusOK)
	require.Equal(t, original, replayed, "replay is the stored response, not the current gauge or current price")
	require.Equal(t, counterBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(e),'xmin',e.xmin::text) FROM entitlement_usage e WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID))
	require.Equal(t, operationBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID))
	require.Equal(t, beforeEvents, recordedEvents(t))
	require.Empty(t, rolloverEvents(t))
}

func TestAIMultipleOperationsI2AndNumericRefundGap(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE entitlement SET reset_period='MONTH',reset_anchor='CALENDAR' WHERE id=$1;`, pool.ID)
	require.NoError(t, err)
	for _, operation := range []struct {
		id     string
		tokens int
	}{{"first", 2}, {"second", 3}, {"third", 4}} {
		commit := aiUsageBody("commit", operation.id, operation.tokens)
		commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
		commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	}
	row := getUsageRow(t, instance.ID, pool.ID)
	var sum float64
	var invalidRows, count int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*),sum(credits_charged)::float8,count(*) FILTER (WHERE abs((value_after-value_before)-credits_charged::float8)>0.0000005) FROM ai_inference WHERE instance_id=$1 AND entitlement_id=$2 AND window_start=$3`, instance.ID, pool.ID, row.PeriodStart.Time).Scan(&count, &sum, &invalidRows))
	counter, err := entitlementvalue.ParseNumberUsageValue(row.Value)
	require.NoError(t, err)
	require.Equal(t, 3, count)
	require.Zero(t, invalidRows, "I1 holds on every charged row")
	require.InDelta(t, sum, counter.Value, float64(count)*0.0000005, "I2 telescopes across all AI commits in the window")
	require.Equal(t, 9.0, counter.Value)
	refund := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, reportUsage(t, instance.Slug, pool.Slug, -1.5, "append"), http.StatusOK)
	require.Equal(t, 7.5, refund.Value.Number.Value)
	commit := aiUsageBody("commit", "after-refund", 2)
	commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	var before, after float64
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT value_before,value_after FROM ai_inference WHERE entitlement_id=$1 AND transaction_id='after-refund'`, pool.ID).Scan(&before, &after))
	require.Equal(t, -1.5, before-counter.Value, "numeric refund appears as an accounting gap, never an inference row")
	require.InDelta(t, 2.0, after-before, 0.0000005)
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*),sum(credits_charged)::float8 FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&count, &sum))
	require.Equal(t, 4, count)
	require.Equal(t, 11.0, sum)
	require.Equal(t, 9.5, after)
	require.Equal(t, -1.5, after-sum)
}

func TestAINumericGateIncludesReservationsAndPartialRefundReopensHeadroom(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 5)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "held", 4)), http.StatusOK)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, reportUsage(t, instance.Slug, pool.Slug, 2, "append"), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)
	fit := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, reportUsage(t, instance.Slug, pool.Slug, 1, "append"), http.StatusOK)
	require.Equal(t, "4", *fit.Reserved)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "held", 7)), http.StatusOK)
	partial := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, reportUsage(t, instance.Slug, pool.Slug, -1, "append"), http.StatusOK)
	require.Equal(t, 7.0, partial.Value.Number.Value, "partial refund is allowed even while still overdrawn")
	zero := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "zero", 0)), http.StatusOK)
	require.Equal(t, "0", *zero.Reserved)
	problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "positive", 1)), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, reportUsage(t, instance.Slug, pool.Slug, -3, "append"), http.StatusOK)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "positive", 1)), http.StatusOK)
	problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, reportUsage(t, instance.Slug, pool.Slug, 0, "set"), http.StatusUnprocessableEntity)
	require.Equal(t, "ReportEntitlementUsageMetric.AiCreditPoolAppendOnly", problem.Code)
}

func TestAIReservationAcrossRolloverChargesNewWindow(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 10)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE entitlement SET reset_period='MONTH',reset_anchor='CALENDAR' WHERE id=$1`, pool.ID)
	require.NoError(t, err)
	window, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)
	oldStart := window.Start.AddDate(0, -1, 0)
	seedUsageRow(t, instance.Slug, pool.Slug, 9, 3, &oldStart)
	beforeCounter := getUsageRow(t, instance.ID, pool.ID)
	beforeEvents := recordedEvents(t)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "rollover", 5)), http.StatusOK)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE ai_inference SET reported_at=$2 WHERE entitlement_id=$1`, pool.ID, window.Start.Add(-time.Second))
	require.NoError(t, err)
	require.Equal(t, beforeCounter, getUsageRow(t, instance.ID, pool.ID))
	require.Equal(t, beforeEvents, recordedEvents(t))
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "rollover", 9)), http.StatusOK)
	require.Equal(t, 9.0, charged.Value.Number.Value, "commit uses the new window, not old consumption plus charge")
	require.Equal(t, int32(1), charged.Value.Number.EventCount)
	require.Equal(t, "0", *charged.Reserved)
	closures := rolloverEvents(t)
	require.Len(t, closures, 1)
	require.Equal(t, 9.0, closures[0].Value)
	require.Equal(t, int32(3), closures[0].EventCount)
	require.True(t, closures[0].ClosedPeriodStart.Equal(oldStart))
	var before, after float64
	var windowStart time.Time
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT value_before,value_after,window_start FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&before, &after, &windowStart))
	require.Zero(t, before)
	require.Equal(t, 9.0, after)
	require.True(t, windowStart.Equal(*charged.CurrentPeriodStart))
}

func TestAIPhaseReplayIdentityAndHorizon(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	reserve := aiUsageBody("reserve", "identity", 2)
	original := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	rowBefore := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID)
	replay := aiReport(t, instance.Slug, pool.Slug, reserve, map[string]string{"Idempotency-Key": "new-http-attempt"})
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, original, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))
	require.Equal(t, rowBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID), "reserve replay never extends TTL")
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "identity", 3)), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
	commit := aiUsageBody("commit", "identity", 3)
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit, map[string]string{"Idempotency-Key": "first-http-attempt"}), http.StatusOK)
	beforeEvents := recordedEvents(t)
	replay = aiReport(t, instance.Slug, pool.Slug, commit, map[string]string{"Idempotency-Key": "second-http-attempt"})
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, charged, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))
	require.Equal(t, beforeEvents, recordedEvents(t))
	problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
	otherPool := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, otherPool.Slug, 100, 0)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO credit_conversion_rule (organization_id,license_id,entitlement_id,rate_per_output_token,created_by_id,updated_by_id) VALUES ($1,$2,$3,1,$4,$4)`, testDb.DefaultData.OrganizationID, instance.LicenseID, otherPool.ID, testDb.DefaultData.UserID)
	require.NoError(t, err)
	bare := aiUsageBody("commit", "identity", 3)
	bare["model"], bare["requestType"] = "lifecycle-model", "COMPLETION"
	independent := aiReport(t, instance.Slug, otherPool.Slug, bare)
	require.Empty(t, independent.Header.Get("Idempotent-Replayed"))
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, independent, http.StatusOK)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE ai_inference SET reported_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '36 days' WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	fresh := aiReport(t, instance.Slug, pool.Slug, bare)
	require.Empty(t, fresh.Header.Get("Idempotent-Replayed"), "id older than the 840h horizon is a new operation")
	freshUsage := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, fresh, http.StatusOK)
	require.Equal(t, 6.0, freshUsage.Value.Number.Value)
	var count int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&count))
	require.Equal(t, 2, count)
}

func TestAICommitOverrideRecordsAndPricesActualModel(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `WITH m AS (
		INSERT INTO model (organization_id,name,slug,vendor,modality,created_by_id,updated_by_id)
		VALUES ($1,'Override','override-model','synthetic','TEXT',$2,$2) RETURNING id)
		INSERT INTO credit_conversion_rule (organization_id,license_id,entitlement_id,model_id,request_type,rate_per_output_token,created_by_id,updated_by_id)
		SELECT $1,$3,$4,id,'EMBEDDING',3,$2,$2 FROM m`, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, instance.LicenseID, pool.ID)
	require.NoError(t, err)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "override", 2)), http.StatusOK)
	commit := aiUsageBody("commit", "override", 2)
	commit["model"], commit["requestType"] = "override-model", "EMBEDDING"
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.Equal(t, "6", *charged.AI.Credits.Charged)
	require.Equal(t, "2", *charged.AI.Credits.Reserved)
	var model, requestType string
	var actualRule bool
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT a.model_ref,a.request_type::text,a.credit_conversion_rule_id=r.id FROM ai_inference a JOIN model m ON m.id=a.model_id JOIN credit_conversion_rule r ON r.model_id=m.id AND r.entitlement_id=a.entitlement_id WHERE a.entitlement_id=$1`, pool.ID).Scan(&model, &requestType, &actualRule))
	require.Equal(t, "override-model", model)
	require.Equal(t, "EMBEDDING", requestType)
	require.True(t, actualRule)
}

func TestAICommitCommercialFailuresRecordedWithoutCharge(t *testing.T) {
	for _, scenario := range []struct {
		name, update, reason, warning, reserveCode string
	}{
		{"archived model", `UPDATE model SET status='ARCHIVED' WHERE slug='lifecycle-model'`, "MODEL_ARCHIVED", "MODEL_NOT_AUTHORIZED", "ModelNotAuthorized"},
		{"no active rule", `UPDATE credit_conversion_rule SET status='ARCHIVED'`, "NO_RULE", "MODEL_NOT_AUTHORIZED", "ModelNotAuthorized"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance, pool := newAIUsagePair(t, 10)
			commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "previously-granted", 2)), http.StatusOK)
			_, err := testServer.Dependencies.DB.Exec(t.Context(), scenario.update)
			require.NoError(t, err)
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "denied", 2)), http.StatusUnprocessableEntity)
			require.Equal(t, "ReportEntitlementUsageMetric."+scenario.reserveCode, problem.Code)
			for _, id := range []string{"previously-granted", "bare-after-denial"} {
				commit := aiUsageBody("commit", id, 2)
				if id == "bare-after-denial" {
					commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
				}
				charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
				require.False(t, *charged.AI.Authorized)
				require.Equal(t, "0", *charged.AI.Credits.Charged)
				require.Zero(t, charged.Value.Number.Value)
				require.Equal(t, "0", *charged.Reserved)
				require.Contains(t, charged.AI.Warnings, scenario.warning)
			}
			var count, missingDenial int
			require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*),count(*) FILTER (WHERE denial_reason IS DISTINCT FROM $2) FROM ai_inference WHERE entitlement_id=$1`, pool.ID, scenario.reason).Scan(&count, &missingDenial))
			require.Equal(t, 2, count)
			require.Zero(t, missingDenial)
			require.Equal(t, 1, countOutboxEvents(t, "INSTANCE_AI_MODEL_USAGE_UNAUTHORIZED"))
		})
	}
}

func TestAISoftMaximumAndUnlimitedGate(t *testing.T) {
	t.Run("soft maximum", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance, pool := newAIUsagePair(t, 10)
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE license_entitlement SET limit_cap_exceeded_overage_percent=20 WHERE entitlement_id=$1;`, pool.ID)
		require.NoError(t, err)
		_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET maximum_credits_per_request=13 WHERE entitlement_id=$1`, pool.ID)
		require.NoError(t, err)
		commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "soft", 12)), http.StatusOK)
		problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "beyond", 1)), http.StatusConflict)
		require.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)
		charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "soft", 99)), http.StatusOK)
		require.Equal(t, "99", *charged.AI.Credits.Computed)
		require.Equal(t, "13", *charged.AI.Credits.Charged, "maximum per request bounds overshoot")
		require.Contains(t, charged.AI.Warnings, "OVERDRAWN")
		require.Equal(t, 1, countOutboxEvents(t, "INSTANCE_ENTITLEMENT_MAXIMUM_EXCEEDED"))
		require.Equal(t, 1, countOutboxEvents(t, "INSTANCE_ENTITLEMENT_CAP_EXCEEDED"))
		commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "soft", 99)), http.StatusOK)
		require.Equal(t, 1, countOutboxEvents(t, "INSTANCE_ENTITLEMENT_MAXIMUM_EXCEEDED"))
	})
	t.Run("unlimited", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance, pool := newAIUsagePair(t, -1)
		reserved := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "unlimited", 1000)), http.StatusOK)
		require.Nil(t, reserved.AI.Remaining)
		charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "unlimited", 2000)), http.StatusOK)
		require.Nil(t, charged.AI.Remaining)
		require.Equal(t, 2000.0, charged.Value.Number.Value)
		require.NotContains(t, charged.AI.Warnings, "OVERDRAWN")
	})
}

func TestAIWireRejectsMissingMalformedIDsAndInvalidPhases(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 10)
	for _, phase := range []string{"reserve", "commit"} {
		for _, tc := range []struct{ id, code string }{{"", "TransactionIdRequired"}, {"spaces forbidden", "InvalidTransactionId"}} {
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody(phase, tc.id, 1)), http.StatusUnprocessableEntity)
			require.Equal(t, "ReportEntitlementUsageMetric."+tc.code, problem.Code)
		}
	}
	reserve := aiUsageBody("reserve", "invalid-ttl", 1)
	reserve["ttlSeconds"] = 3601
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusUnprocessableEntity)
	require.Equal(t, "ReportEntitlementUsageMetric.InvalidAiUsage", problem.Code)
	commit := aiUsageBody("commit", "missing-model", 1)
	problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusUnprocessableEntity)
	require.Equal(t, "ReportEntitlementUsageMetric.InvalidAiUsage", problem.Code)
	reserve = aiUsageBody("reserve", "unknown", 1)
	reserve["model"] = "missing-model"
	problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusUnprocessableEntity)
	require.Equal(t, "ReportEntitlementUsageMetric.UnknownModel", problem.Code)
}
