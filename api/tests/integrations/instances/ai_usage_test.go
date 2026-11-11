package instances_test

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
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
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance := newInstances(t, 1)[0]
	pool, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{Name: "AI Credits", Slug: "ai-credits", Type: entitlementschema.NumberAICredit, AggregationMethod: ptr.To(entitlementschema.Sum)}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	assignAIPoolToLicense(t, instance.LicenseSlug, pool.Slug, 5, 0)
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
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance := newInstances(t, 1)[0]
	pool, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{Name: "Credits", Slug: "history-credits", Type: entitlementschema.NumberAICredit, AggregationMethod: ptr.To(entitlementschema.Sum)}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	assignAIPoolToLicense(t, instance.LicenseSlug, pool.Slug, 100, 0)
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
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance := newInstances(t, 1)[0]
	pool := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	assignAIPoolToLicense(t, instance.LicenseSlug, pool.Slug, 10, 0)
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
	assignAIPoolToLicense(t, instance.LicenseSlug, pool.Slug, limit, overagePercent)
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
	useAIForThisTest(t)
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
	useAIForThisTest(t)
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
	useAIForThisTest(t)
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
	useAIForThisTest(t)
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

// An SDK releases on every failure path, including a call whose reserve never
// reached Kaiten. That release is a question with a fixed answer, not evidence.
func TestAIReleaseWithoutReservationWritesNothing(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 10)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE entitlement SET reset_period='MONTH',reset_anchor='CALENDAR' WHERE id=$1`, pool.ID)
	require.NoError(t, err)
	window, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)
	oldStart := window.Start.AddDate(0, -1, 0)
	seedUsageRow(t, instance.Slug, pool.Slug, 9, 3, &oldStart)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "held", 4)), http.StatusOK)
	// The reserve above rolled the window over; stale it again so the no-op
	// is shown to leave even period maintenance to the next real report.
	seedUsageRow(t, instance.Slug, pool.Slug, 9, 3, &oldStart)
	counterBefore := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(e),'xmin',e.xmin::text) FROM entitlement_usage e WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID)
	operationsBefore := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) ORDER BY a.id) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID)
	beforeEvents := recordedEvents(t)

	// Neither model nor requestType: there is nothing to price. An unknown
	// model changes nothing either, and raises no unauthorized event.
	release := map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "never-reserved", "requestStatus": "NOT_SENT"}
	withModel := map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "never-reserved-either", "requestStatus": "NOT_SENT", "model": "missing-model", "requestType": "COMPLETION"}
	for _, body := range []map[string]any{release, release, withModel} {
		response := aiReport(t, instance.Slug, pool.Slug, body)
		require.Empty(t, response.Header.Get("Idempotent-Replayed"), "nothing was stored to replay")
		released := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, response, http.StatusOK)
		require.Equal(t, "RELEASED", released.AI.Status)
		require.Equal(t, "commit", released.AI.Phase)
		require.Equal(t, "0", *released.AI.Credits.Charged)
		require.Nil(t, released.AI.Credits.Reserved)
		require.Nil(t, released.AI.Authorized, "no model was evaluated")
		require.Equal(t, []string{instanceschema.AiWarningNoReservation}, released.AI.Warnings)
		require.Equal(t, "4", *released.Reserved, "another operation's reservation is untouched")
		require.Equal(t, "6", *released.AI.Remaining)
		require.Zero(t, released.Value.Number.Value)
	}
	require.Equal(t, counterBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(e),'xmin',e.xmin::text) FROM entitlement_usage e WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID))
	require.Equal(t, operationsBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) ORDER BY a.id) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID))
	require.Equal(t, beforeEvents, recordedEvents(t))

	// The key stays free: the operation can still be reported for real.
	commit := aiUsageBody("commit", "never-reserved", 2)
	commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.Equal(t, "2", *charged.AI.Credits.Charged)

	// A pair nothing grants still answers 404, and a pool that is not a
	// credit pool still refuses AI usage.
	ungranted := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, ungranted.Slug, release), http.StatusNotFound)
	require.Equal(t, "ReportEntitlementUsageMetric.ContextNotFound", problem.Code)
}

func TestAIStaleWindowReplayWritesNoCounterOperationOrOutbox(t *testing.T) {
	useAIForThisTest(t)
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
	useAIForThisTest(t)
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
	useAIForThisTest(t)
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
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 10)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE entitlement SET reset_period='MONTH',reset_anchor='CALENDAR' WHERE id=$1`, pool.ID)
	require.NoError(t, err)
	window, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)
	oldStart := window.Start.AddDate(0, -1, 0)
	beforeEvents := recordedEvents(t)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "rollover", 5)), http.StatusOK)
	require.Equal(t, beforeEvents, recordedEvents(t))
	// The reservation was taken in the previous window: its counter is seeded
	// after the reserve, because a reserve now persists the rollover it
	// resolves (TestAIRolloverPersistedOnEveryPhase).
	seedUsageRow(t, instance.Slug, pool.Slug, 9, 3, &oldStart)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE ai_inference SET reported_at=$2 WHERE entitlement_id=$1`, pool.ID, window.Start.Add(-time.Second))
	require.NoError(t, err)
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

// A reserve, a refused reserve and a commit that charges nothing are reports
// like any other: each persists the rollover it resolved, once, and the next
// charged commit finds the window already open.
func TestAIRolloverPersistedOnEveryPhase(t *testing.T) {
	useAIForThisTest(t)
	unknown := func(phase, id string) map[string]any {
		value := aiUsageBody(phase, id, 2)
		value["model"], value["requestType"] = "missing-model", "COMPLETION"
		return value
	}
	for _, scenario := range []struct {
		name   string
		first  map[string]any
		status int
		events int
	}{
		{"reserve", aiUsageBody("reserve", "first", 2), http.StatusOK, 1},
		{"refused reserve", unknown("reserve", "first"), http.StatusUnprocessableEntity, 2},
		{"zero-charge commit", unknown("commit", "first"), http.StatusOK, 2},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance, pool := newAIUsagePair(t, 100)
			_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE entitlement SET reset_period='MONTH',reset_anchor='CALENDAR' WHERE id=$1`, pool.ID)
			require.NoError(t, err)
			window, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
			require.NoError(t, err)
			oldStart := window.Start.AddDate(0, -1, 0)
			seedUsageRow(t, instance.Slug, pool.Slug, 9, 3, &oldStart)
			beforeEvents := recordedEvents(t)
			response := aiReport(t, instance.Slug, pool.Slug, scenario.first)
			require.Equal(t, scenario.status, response.StatusCode)
			// The rollover, plus the phase's own event: REJECTED for the
			// refusal, MODEL_USAGE_UNAUTHORIZED for the unknown model.
			require.Len(t, recordedEvents(t), len(beforeEvents)+scenario.events)
			closures := rolloverEvents(t)
			require.Len(t, closures, 1, "rollover emitted once, by the first report of the window")
			require.Equal(t, 9.0, closures[0].Value)
			require.True(t, closures[0].ClosedPeriodStart.Equal(oldStart))
			row := getUsageRow(t, instance.ID, pool.ID)
			require.True(t, row.PeriodStart.Time.Equal(window.Start), "period_start = %v, want %v", row.PeriodStart.Time, window.Start)
			counter, err := entitlementvalue.ParseNumberUsageValue(row.Value)
			require.NoError(t, err)
			require.Zero(t, counter.Value)
			require.Zero(t, counter.EventCount)
			var journal int
			require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM usage_ledger WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&journal))
			require.Zero(t, journal, "a rollover alone is not a journal entry")

			commit := aiUsageBody("commit", "charged", 4)
			commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
			charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
			require.Equal(t, 4.0, charged.Value.Number.Value)
			require.Equal(t, int32(1), charged.Value.Number.EventCount)
			require.Len(t, rolloverEvents(t), 1, "and not again by the commit that charges")
		})
	}
}

func TestAIPhaseReplayIdentityAndHorizon(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	reserve := aiUsageBody("reserve", "identity", 2)
	original := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	rowBefore := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID)
	headerProblem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve, map[string]string{"Idempotency-Key": "new-http-attempt"}), http.StatusUnprocessableEntity)
	require.Equal(t, "ReportEntitlementUsageMetric.AiIdempotencyKeyUnsupported", headerProblem.Code)
	require.Equal(t, rowBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID), "a rejected numeric header never changes AI evidence")
	replay := aiReport(t, instance.Slug, pool.Slug, reserve)
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, original, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))
	require.Equal(t, rowBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1`, pool.ID), "reserve replay never extends TTL")
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "identity", 3)), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
	commit := aiUsageBody("commit", "identity", 3)
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	beforeEvents := recordedEvents(t)
	replay = aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, charged, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))
	require.Equal(t, beforeEvents, recordedEvents(t))
	problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
	otherPool := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	assignAIPoolToLicense(t, instance.LicenseSlug, otherPool.Slug, 100, 0)
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
	useAIForThisTest(t)
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
	useAIForThisTest(t)
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
	useAIForThisTest(t)
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

// The counter is a float64: past about 1e10 it cannot hold a micro-credit
// charge within half a quantum. The commit is recorded all the same, with the
// exact charge on the row and in the journal, and says the counter drifted.
func TestAICommitOnASaturatedCounterIsRecordedWithAPrecisionWarning(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, -1)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET rate_per_output_token=0.000001 WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	seedUsageRow(t, instance.Slug, pool.Slug, 10000000000, 1, nil)
	commit := aiUsageBody("commit", "saturated", 1)
	commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.Equal(t, "COMMITTED", charged.AI.Status)
	require.Equal(t, "0.000001", *charged.AI.Credits.Charged)
	require.Contains(t, charged.AI.Warnings, instanceschema.AiWarningCounterPrecisionDegraded)
	var exact string
	var before, after float64
	var warnings []string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT credits_charged::text,value_before,value_after,warnings FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&exact, &before, &after, &warnings))
	require.Contains(t, warnings, instanceschema.AiWarningCounterPrecisionDegraded)
	require.Equal(t, "0.000001", exact, "the NUMERIC charge is exact whatever the counter could hold")
	require.Greater(t, math.Abs((after-before)-0.000001), 0.0000005, "the scenario is the one I1 cannot hold in")
	var journal int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM usage_ledger WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&journal))
	require.Equal(t, 1, journal)
	replay := aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, charged, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))
}

// A charged commit is one journal entry; the inference keeps its sequence
// number. What moved nothing has none.
func TestAIChargedCommitKeepsTheJournalSequence(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	bare := aiUsageBody("commit", "bare", 2)
	bare["model"], bare["requestType"] = "lifecycle-model", "COMPLETION"
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, bare), http.StatusOK)
	// A numeric report in between takes a sequence number of its own.
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, reportUsage(t, instance.Slug, pool.Slug, 1, "append"), http.StatusOK)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "reserved", 3)), http.StatusOK)
	sequence := func(id string) *int64 {
		var seq *int64
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT report_seq FROM ai_inference WHERE entitlement_id=$1 AND transaction_id=$2`, pool.ID, id).Scan(&seq))
		return seq
	}
	require.Nil(t, sequence("reserved"), "a reservation counted nothing")
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "reserved", 4)), http.StatusOK)
	unknown := aiUsageBody("commit", "uncharged", 5)
	unknown["model"], unknown["requestType"] = "missing-model", "COMPLETION"
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, unknown), http.StatusOK)
	released := aiUsageBody("reserve", "released", 1)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, released), http.StatusOK)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "released", "requestStatus": "NOT_SENT"}), http.StatusOK)
	require.Nil(t, sequence("uncharged"), "a commit that charged nothing is not in the journal")
	require.Nil(t, sequence("released"))

	// Each charged inference joins exactly its own journal row, on the pair
	// and the sequence number: same amount, same counter.
	rows, err := testServer.Dependencies.DB.Query(t.Context(), `SELECT a.transaction_id, a.report_seq, a.credits_charged::float8, l.reported_value::float8, a.value_before, l.value_before::float8, a.value_after, l.value_after::float8
		FROM ai_inference a JOIN usage_ledger l ON l.instance_id=a.instance_id AND l.entitlement_id=a.entitlement_id AND l.report_seq=a.report_seq
		WHERE a.entitlement_id=$1 ORDER BY a.report_seq`, pool.ID)
	require.NoError(t, err)
	defer rows.Close()
	var ids []string
	var seqs []int64
	for rows.Next() {
		var id string
		var seq int64
		var charged, reported, before, journalBefore, after, journalAfter float64
		require.NoError(t, rows.Scan(&id, &seq, &charged, &reported, &before, &journalBefore, &after, &journalAfter))
		require.Equal(t, charged, reported, id)
		require.Equal(t, before, journalBefore, id)
		require.Equal(t, after, journalAfter, id)
		require.InDelta(t, charged, after-before, 0.0000005, "I1: %s", id)
		ids, seqs = append(ids, id), append(seqs, seq)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{"bare", "reserved"}, ids)
	require.Equal(t, []int64{1, 3}, seqs, "the numeric report took sequence 2")
	var journal int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM usage_ledger WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&journal))
	require.Equal(t, 3, journal)
}

// aiExplain is what an ai_inference row says about itself.
type aiExplain struct {
	pricing   *instanceschema.AiInferencePricing
	licenseID *uuid.UUID
	warnings  []string
	snapshot  string
}

func readAIExplain(t *testing.T, poolID uuid.UUID, transactionID string) aiExplain {
	t.Helper()
	var raw []byte
	var explain aiExplain
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT pricing,license_id,warnings,jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text)::text FROM ai_inference a WHERE entitlement_id=$1 AND transaction_id=$2`, poolID, transactionID).Scan(&raw, &explain.licenseID, &explain.warnings, &explain.snapshot))
	if raw != nil {
		// The stored document is the read type itself: what the history decodes.
		explain.pricing = &instanceschema.AiInferencePricing{}
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.DisallowUnknownFields()
		require.NoError(t, decoder.Decode(explain.pricing))
	}
	return explain
}

// The row explains its own charge: the rule as it priced the operation, the
// licence version, and the warnings answered. Editing the rule afterwards
// changes none of it.
func TestAICommitSnapshotsTheRuleThatPricedIt(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 5)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET rate_per_input_token=0.25,rate_per_cached_input_token=0.0125,minimum_credits_per_request=0.5,maximum_credits_per_request=40 WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	var ruleID uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT id FROM credit_conversion_rule WHERE entitlement_id=$1`, pool.ID).Scan(&ruleID))
	maximum := "40"
	want := instanceschema.AiInferencePricing{
		RuleID: ruleID, Specificity: aicredit.ExactAll,
		Rates:                    instanceschema.AiInferenceRates{PerInputToken: ptr.To("0.25"), PerCachedInputToken: ptr.To("0.0125"), PerOutputToken: ptr.To("1")},
		MinimumCreditsPerRequest: "0.5", MaximumCreditsPerRequest: &maximum, ChargeOnError: aicredit.Always,
	}

	reserved := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "explained", 2)), http.StatusOK)
	atReserve := readAIExplain(t, pool.ID, "explained")
	require.Equal(t, &want, atReserve.pricing, "the reserve snapshots the rule its estimate was priced with")
	require.Equal(t, instance.LicenseID, *atReserve.licenseID)
	require.Equal(t, reserved.AI.Warnings, atReserve.warnings)
	require.Empty(t, atReserve.warnings)

	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "explained", 7)), http.StatusOK)
	require.Equal(t, "7", *charged.AI.Credits.Charged)
	require.Contains(t, charged.AI.Warnings, instanceschema.AiWarningOverdrawn)
	committed := readAIExplain(t, pool.ID, "explained")
	require.Equal(t, &want, committed.pricing)
	require.Equal(t, instance.LicenseID, *committed.licenseID)
	require.Equal(t, charged.AI.Warnings, committed.warnings, "the row carries the warnings the commit answered with")

	// The rule is edited in place (AC-13), then archived. The record still
	// shows the rates it was charged at, and a replay rewrites nothing.
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET rate_per_output_token=99,rate_per_input_token=NULL,maximum_credits_per_request=NULL,charge_on_error='NEVER' WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	beforeEvents := recordedEvents(t)
	replay := aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "explained", 7))
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, charged, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))
	require.Equal(t, committed, readAIExplain(t, pool.ID, "explained"), "the snapshot is the old rule, and the replay wrote nothing")
	require.Equal(t, beforeEvents, recordedEvents(t))

	// The next call is priced, and snapshotted, with the rule as it now is.
	next := aiUsageBody("commit", "repriced", 1)
	next["model"], next["requestType"] = "lifecycle-model", "COMPLETION"
	repriced := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, next), http.StatusOK)
	require.Equal(t, "99", *repriced.AI.Credits.Charged)
	require.Equal(t, &instanceschema.AiInferencePricing{
		RuleID: ruleID, Specificity: aicredit.ExactAll,
		Rates:                    instanceschema.AiInferenceRates{PerCachedInputToken: ptr.To("0.0125"), PerOutputToken: ptr.To("99")},
		MinimumCreditsPerRequest: "0.5", ChargeOnError: aicredit.Never,
	}, readAIExplain(t, pool.ID, "repriced").pricing)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET status='ARCHIVED' WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	require.Equal(t, committed, readAIExplain(t, pool.ID, "explained"))
}

// A reservation does not lock the rates: the commit prices with the rule of
// its own instant and overwrites the reserve's snapshot -- with nothing when
// no rule applies any more.
func TestAICommitOverwritesTheReserveSnapshot(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	for _, id := range []string{"repriced", "unpriced"} {
		commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", id, 2)), http.StatusOK)
		require.Equal(t, "1", *readAIExplain(t, pool.ID, id).pricing.Rates.PerOutputToken)
	}
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET rate_per_output_token=3 WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "repriced", 2)), http.StatusOK)
	require.Equal(t, "6", *charged.AI.Credits.Charged)
	require.Equal(t, "3", *readAIExplain(t, pool.ID, "repriced").pricing.Rates.PerOutputToken)

	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET status='ARCHIVED' WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	denied := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "unpriced", 2)), http.StatusOK)
	require.False(t, *denied.AI.Authorized)
	unpriced := readAIExplain(t, pool.ID, "unpriced")
	require.Nil(t, unpriced.pricing, "no rule priced the commit: the reserve's snapshot does not survive it")
	require.Equal(t, instance.LicenseID, *unpriced.licenseID)
	require.Equal(t, denied.AI.Warnings, unpriced.warnings)
	require.Equal(t, []string{instanceschema.AiWarningModelNotAuthorized}, unpriced.warnings)
}

// An unauthorized operation has no price to explain, but still says which
// licence refused it and what it was answered.
func TestAIUnauthorizedCommitRecordsLicenceAndWarningsWithoutPricing(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE model SET status='DEPRECATED' WHERE slug='lifecycle-model'`)
	require.NoError(t, err)
	unknown := aiUsageBody("commit", "unknown", 2)
	unknown["model"], unknown["requestType"] = "missing-model", "COMPLETION"
	denied := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, unknown), http.StatusOK)
	row := readAIExplain(t, pool.ID, "unknown")
	require.Nil(t, row.pricing)
	require.Equal(t, instance.LicenseID, *row.licenseID)
	require.Equal(t, []string{instanceschema.AiWarningUnknownModel}, row.warnings)
	require.Equal(t, denied.AI.Warnings, row.warnings)

	// Several warnings are kept in the order they were answered.
	deprecated := aiUsageBody("commit", "deprecated", 2)
	deprecated["model"], deprecated["requestType"] = "lifecycle-model", "COMPLETION"
	delete(deprecated, "usage")
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, deprecated), http.StatusOK)
	require.Equal(t, []string{instanceschema.AiWarningModelDeprecated, instanceschema.AiWarningConversionInputMissing}, charged.AI.Warnings)
	require.Equal(t, charged.AI.Warnings, readAIExplain(t, pool.ID, "deprecated").warnings)
}

// readAIVendorCost returns the two vendor costs of an operation as the
// database prints them, "" for NULL.
func readAIVendorCost(t *testing.T, poolID uuid.UUID, transactionID string) (reported, computed string) {
	t.Helper()
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT COALESCE(vendor_cost_reported::text,''),COALESCE(vendor_cost_computed::text,'') FROM ai_inference WHERE entitlement_id=$1 AND transaction_id=$2`, poolID, transactionID).Scan(&reported, &computed))
	return reported, computed
}

// What a request cost the provider is recorded beside what it was charged:
// as the caller reports it on the commit, and as the catalogue's costs
// compute it. Neither changes the charge.
func TestAICommitRecordsReportedAndComputedVendorCost(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, -1)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE model SET vendor_cost_per_input_token=0.000003,vendor_cost_per_output_token=0.000015,vendor_cost_per_request=0.001,vendor_cost_per_unit=0.04 WHERE slug='lifecycle-model'`)
	require.NoError(t, err)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO model (organization_id,name,slug,vendor,modality,created_by_id,updated_by_id) VALUES ($1,'Costless','costless-model','synthetic','TEXT',$2,$2)`, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID)
	require.NoError(t, err)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO credit_conversion_rule (organization_id,license_id,entitlement_id,rate_per_output_token,created_by_id,updated_by_id) VALUES ($1,$2,$3,1,$4,$4)`, testDb.DefaultData.OrganizationID, instance.LicenseID, pool.ID, testDb.DefaultData.UserID)
	require.NoError(t, err)
	commit := func(id, model, status string, usage map[string]any, vendorCost any) instanceschema.EntitlementUsage {
		value := map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": id, "model": model, "requestType": "COMPLETION", "requestStatus": status}
		if usage != nil {
			value["usage"] = usage
		}
		if vendorCost != nil {
			value["vendorCost"] = vendorCost
		}
		return commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, value), http.StatusOK)
	}
	tokens := map[string]any{"inputTokens": 1000, "cacheReadInputTokens": 2000, "outputTokens": 500, "units": "2.5", "unitType": "image"}

	// Reported and computed. A cache read is costed at the input cost, the
	// model having no cached-input cost of its own:
	// 0.001 + 1000*0.000003 + 2000*0.000003 + 500*0.000015 + 2.5*0.04.
	both := commit("both", "lifecycle-model", "SUCCESS", tokens, "0.0123")
	reported, computed := readAIVendorCost(t, pool.ID, "both")
	require.Equal(t, "0.012300000000", reported)
	require.Equal(t, "0.117500000000", computed)

	// The charge is the rule's alone: the same usage without a vendor cost.
	without := commit("computed-only", "lifecycle-model", "SUCCESS", tokens, nil)
	require.Equal(t, *both.AI.Credits.Charged, *without.AI.Credits.Charged)
	require.Equal(t, "500", *both.AI.Credits.Charged)
	reported, computed = readAIVendorCost(t, pool.ID, "computed-only")
	require.Empty(t, reported)
	require.Equal(t, "0.117500000000", computed)

	// Absent: nothing reported, and a model the catalogue gives no cost.
	commit("absent", "costless-model", "SUCCESS", tokens, nil)
	reported, computed = readAIVendorCost(t, pool.ID, "absent")
	require.Empty(t, reported)
	require.Empty(t, computed, "no cost at all is unknown, not free")

	// A model that is not in the catalogue has no cost to compute from.
	commit("unknown", "missing-model", "SUCCESS", tokens, "1.5")
	reported, computed = readAIVendorCost(t, pool.ID, "unknown")
	require.Equal(t, "1.500000000000", reported)
	require.Empty(t, computed)

	// A failed request is costed from the quantities it reports, and not at
	// all without any; the rule here never charges an error.
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE credit_conversion_rule SET charge_on_error='NEVER' WHERE entitlement_id=$1`, pool.ID)
	require.NoError(t, err)
	failed := commit("provider-error", "lifecycle-model", "PROVIDER_ERROR", map[string]any{"inputTokens": 1000}, nil)
	require.Equal(t, "0", *failed.AI.Credits.Charged)
	_, computed = readAIVendorCost(t, pool.ID, "provider-error")
	require.Equal(t, "0.004000000000", computed)
	commit("customer-error", "lifecycle-model", "CUSTOMER_ERROR", map[string]any{"outputTokens": 100}, nil)
	_, computed = readAIVendorCost(t, pool.ID, "customer-error")
	require.Equal(t, "0.002500000000", computed)
	commit("error-without-usage", "lifecycle-model", "PROVIDER_ERROR", nil, nil)
	_, computed = readAIVendorCost(t, pool.ID, "error-without-usage")
	require.Empty(t, computed)

	// A request that was never sent cost nothing to compute, reserved or not.
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "released", 5)), http.StatusOK)
	reported, computed = readAIVendorCost(t, pool.ID, "released")
	require.Empty(t, reported)
	require.Empty(t, computed, "a reservation has cost the provider nothing yet")
	release := aiUsageBody("commit", "released", 5)
	release["requestStatus"] = "NOT_SENT"
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, release), http.StatusOK)
	_, computed = readAIVendorCost(t, pool.ID, "released")
	require.Empty(t, computed)
}

// vendorCost belongs to the commit. A reserve refuses it, so it is never part
// of a reservation's identity; on the commit it is part of the body, and a
// retry must repeat it.
func TestAIVendorCostIsCommitOnlyAndPartOfTheCommitIdentity(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	reserve := aiUsageBody("reserve", "costed", 2)
	reserve["vendorCost"] = "0.01"
	beforeEvents := recordedEvents(t)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusUnprocessableEntity)
	require.Equal(t, "ReportEntitlementUsageMetric.InvalidAiUsage", problem.Code)
	var operations int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&operations))
	require.Zero(t, operations)
	require.Equal(t, beforeEvents, recordedEvents(t))
	for _, malformed := range []any{"-1", "1e3", "0.0000000000001", "1234567890123", "", 0.5} {
		commit := aiUsageBody("commit", "malformed", 2)
		commit["model"], commit["requestType"], commit["vendorCost"] = "lifecycle-model", "COMPLETION", malformed
		response := aiReport(t, instance.Slug, pool.Slug, commit)
		require.Equal(t, http.StatusUnprocessableEntity, response.StatusCode, "vendorCost=%v", malformed)
	}
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference WHERE entitlement_id=$1`, pool.ID).Scan(&operations))
	require.Zero(t, operations)

	// The same reservation is closed by a commit with a vendor cost...
	delete(reserve, "vendorCost")
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	commit := aiUsageBody("commit", "costed", 3)
	commit["vendorCost"] = "0.01"
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.Equal(t, "3", *charged.AI.Credits.Charged)
	reported, _ := readAIVendorCost(t, pool.ID, "costed")
	require.Equal(t, "0.010000000000", reported)
	rowBefore := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1 AND transaction_id='costed'`, pool.ID)
	// ...its retry repeats the cost and is a replay...
	replay := aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, charged, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))
	// ...and the same commit without it, or with another, is another body.
	for _, other := range []any{nil, "0.02", "0.010"} {
		different := aiUsageBody("commit", "costed", 3)
		if other != nil {
			different["vendorCost"] = other
		}
		problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, different), http.StatusConflict)
		require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
	}
	require.Equal(t, rowBefore, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE entitlement_id=$1 AND transaction_id='costed'`, pool.ID))

	// ...or by a commit without one: the reservation is the same either way.
	reserve["transactionId"] = "uncosted"
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "uncosted", 3)), http.StatusOK)
	reported, _ = readAIVendorCost(t, pool.ID, "uncosted")
	require.Empty(t, reported)
}

func TestAIWireRejectsMissingMalformedIDsAndInvalidPhases(t *testing.T) {
	useAIForThisTest(t)
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

// Explicit AI fixture only. No ordinary helper or process-wide default opts in.
func useAIForThisTest(t *testing.T) {
	t.Helper()
	previous := testServer
	enabled := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
	testServer = enabled
	t.Cleanup(func() { testServer = previous; require.NoError(t, enabled.Close()) })
}

func assignAIPoolToLicense(t *testing.T, licenseSlug, entitlementSlug string, threshold, overagePercent int32) {
	t.Helper()
	policy := aiusage.Policy{Flags: aitest.Flags(true)}
	ctx := policy.Resolve(t.Context(), testDb.DefaultData.OrganizationID)
	repo := associateentitlementwithlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB), policy)
	_, err := repo.AssociateEntitlementToLicense(ctx, licenseSlug, &associateentitlementwithlicense.Command{EntitlementSlug: entitlementSlug, Value: map[string]any{"type": "number", "value": threshold}, LimitCapExceededOveragePercent: &overagePercent}, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
}
