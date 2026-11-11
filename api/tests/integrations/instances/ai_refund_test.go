package instances_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// A refund is a negative report tied to the inference it corrects. These
// tests go over HTTP against Postgres: the counter and the journal move by
// the report's own write step, and the link is read back on the inference.

func refundPath(instance, pool, transactionID string) string {
	return "/api/instances/" + instance + "/entitlements/" + pool + "/usage/inferences/" + url.PathEscape(transactionID) + "/refund"
}

// aiRefundOn sends a refund; key "" sends no Idempotency-Key.
func aiRefundOn(t *testing.T, app *fiber.App, instance, pool, transactionID, key string, body map[string]any) *http.Response {
	t.Helper()
	var headers []map[string]string
	if key != "" {
		headers = append(headers, map[string]string{"Idempotency-Key": key})
	}
	if body == nil {
		body = map[string]any{}
	}
	resp, err := app.Test(commonfixture.NewJSONRequest(t, http.MethodPost, refundPath(instance, pool, transactionID), body, headers...), fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func aiRefund(t *testing.T, instance, pool, transactionID, key string, body map[string]any) *http.Response {
	t.Helper()
	return aiRefundOn(t, testServer.App, instance, pool, transactionID, key, body)
}

func refundProblem(t *testing.T, resp *http.Response, status int, code string) apierrors.Problem {
	t.Helper()
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, resp, status)
	require.Equal(t, code, problem.Code)
	return problem
}

// poolMovement is what a refund must move, and what a refused one must not.
type poolMovement struct {
	counter  float64
	journal  int
	accepted int
	refunds  int
}

func readPoolMovement(t *testing.T, instanceID, poolID uuid.UUID) poolMovement {
	t.Helper()
	var m poolMovement
	counter, err := entitlementvalue.ParseNumberUsageValue(getUsageRow(t, instanceID, poolID).Value)
	require.NoError(t, err)
	m.counter = counter.Value
	db := testServer.Dependencies.DB
	require.NoError(t, db.QueryRow(t.Context(), `SELECT count(*) FROM usage_ledger WHERE instance_id=$1 AND entitlement_id=$2`, instanceID, poolID).Scan(&m.journal))
	require.NoError(t, db.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference_refund WHERE instance_id=$1 AND entitlement_id=$2`, instanceID, poolID).Scan(&m.refunds))
	for _, event := range commonfixture.ListOutboxEvents(t, db, testDb.DefaultData.OrganizationID) {
		if event.EventName == instanceEvents.EntitlementUsageReportAccepted.Name {
			m.accepted++
		}
	}
	return m
}

func chargedCommit(t *testing.T, instance, pool, id string, tokens int) {
	t.Helper()
	commit := aiUsageBody("commit", id, tokens)
	commit["model"], commit["requestType"] = "lifecycle-model", "COMPLETION"
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance, pool, commit), http.StatusOK)
}

func inferenceOf(t *testing.T, instance, pool, transactionID string) instanceschema.AiInference {
	t.Helper()
	page := historyPage(t, instance, pool, url.Values{"transactionId": {transactionID}})
	require.Len(t, page.Items, 1)
	return page.Items[0]
}

func TestAIRefundPartialRemainderReplayAndRefusals(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	db := testServer.Dependencies.DB

	chargedCommit(t, instance.Slug, pool.Slug, "charged", 9)
	chargedCommit(t, instance.Slug, pool.Slug, "other", 2)
	unknown := aiUsageBody("commit", "uncharged", 5)
	unknown["model"], unknown["requestType"] = "missing-model", "COMPLETION"
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, unknown), http.StatusOK)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "held", 3)), http.StatusOK)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "ghost", "requestStatus": "NOT_SENT"}), http.StatusOK)

	start := readPoolMovement(t, instance.ID, pool.ID)
	require.Equal(t, 11.0, start.counter)
	require.Empty(t, inferenceOf(t, instance.Slug, pool.Slug, "charged").Refunds)
	require.Nil(t, inferenceOf(t, instance.Slug, pool.Slug, "charged").Credits.Refunded)

	// A partial refund: the counter moves by exactly the amount, through one
	// journal row whose sequence number the link stores.
	first := aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-1", map[string]any{"credits": "3.5", "reason": "duplicate call"})
	require.Empty(t, first.Header.Get("Idempotent-Replayed"))
	partial := commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, first, http.StatusOK)
	require.Equal(t, "3.5", partial.Credits)
	require.Equal(t, "duplicate call", *partial.Reason)
	require.Equal(t, testDb.DefaultData.UserID, partial.CreatedBy.ID)
	require.NotEmpty(t, partial.CreatedBy.Name)
	after := readPoolMovement(t, instance.ID, pool.ID)
	require.InDelta(t, -3.5, after.counter-start.counter, 0.0000005, "I1: the counter moved by the refund")
	require.Equal(t, start.journal+1, after.journal)
	require.Equal(t, start.accepted+1, after.accepted, "the report's own accepted event, once")
	require.Equal(t, 1, after.refunds)

	var journal struct {
		seq                     int64
		reported, before, value float64
		behavior, key           string
		properties              []byte
		reportedAt              time.Time
	}
	require.NoError(t, db.QueryRow(t.Context(), `SELECT report_seq, reported_value::float8, value_before::float8, value_after::float8, behavior::text, transaction_id, properties, reported_at
		FROM usage_ledger WHERE instance_id=$1 AND entitlement_id=$2 ORDER BY report_seq DESC LIMIT 1`, instance.ID, pool.ID).
		Scan(&journal.seq, &journal.reported, &journal.before, &journal.value, &journal.behavior, &journal.key, &journal.properties, &journal.reportedAt))
	require.Equal(t, journal.seq, partial.ReportSeq, "the link names the journal row")
	require.Equal(t, -3.5, journal.reported)
	require.Equal(t, 11.0, journal.before)
	require.Equal(t, 7.5, journal.value)
	require.Equal(t, "append", strings.ToLower(journal.behavior))
	require.Equal(t, "refund-1", journal.key, "the refund's key is the journal row's transactionId")
	require.JSONEq(t, `{"refundOf":"charged"}`, string(journal.properties), "the reason is not copied into the journal")
	require.True(t, journal.reportedAt.Equal(partial.CreatedAt), "dated by the report's instant")
	var stored struct {
		seq       int64
		credits   string
		inference uuid.UUID
	}
	require.NoError(t, db.QueryRow(t.Context(), `SELECT r.report_seq, r.credits::text, r.inference_id FROM ai_inference_refund r WHERE r.id=$1 AND r.organization_id=$2`, partial.ID, testDb.DefaultData.OrganizationID).
		Scan(&stored.seq, &stored.credits, &stored.inference))
	require.Equal(t, journal.seq, stored.seq)
	require.Equal(t, "3.500000", stored.credits)

	// A replay answers the original refund and moves nothing, whatever the
	// spelling of the same amount.
	for _, credits := range []string{"3.5", "3.50"} {
		replay := aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-1", map[string]any{"credits": credits, "reason": "duplicate call"})
		require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
		require.Equal(t, partial, commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, replay, http.StatusOK))
	}
	require.Equal(t, after, readPoolMovement(t, instance.ID, pool.ID))

	// The same key with another body, or on another inference.
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-1", map[string]any{"credits": "1", "reason": "duplicate call"}), http.StatusConflict, "RefundAiInference.IdempotencyKeyReused")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-1", map[string]any{"credits": "3.5"}), http.StatusConflict, "RefundAiInference.IdempotencyKeyReused")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "other", "refund-1", map[string]any{"credits": "3.5", "reason": "duplicate call"}), http.StatusConflict, "RefundAiInference.IdempotencyKeyReused")

	// More than what is left.
	over := refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-over", map[string]any{"credits": "5.500001"}), http.StatusConflict, "RefundAiInference.ExceedsRefundable")
	require.Len(t, over.Errors, 1)
	require.Equal(t, "5.5", over.Errors[0].Value)

	// What cannot be refunded at all.
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "uncharged", "refund-a", nil), http.StatusConflict, "RefundAiInference.NothingToRefund")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "held", "refund-b", nil), http.StatusConflict, "RefundAiInference.NotCommitted")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "ghost", "refund-c", nil), http.StatusConflict, "RefundAiInference.NotCommitted")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "never-reported", "refund-d", nil), http.StatusNotFound, "RefundAiInference.InferenceNotFound")
	refundProblem(t, aiRefund(t, instance.Slug, "no-such-pool", "charged", "refund-e", nil), http.StatusNotFound, "RefundAiInference.ContextNotFound")
	refundProblem(t, aiRefund(t, "no-such-instance", pool.Slug, "charged", "refund-f", nil), http.StatusNotFound, "RefundAiInference.ContextNotFound")

	// What the request itself gets wrong.
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "", nil), http.StatusUnprocessableEntity, "RefundAiInference.IdempotencyKeyRequired")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "not a key", nil), http.StatusUnprocessableEntity, "RefundAiInference.InvalidIdempotencyKey")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-g", map[string]any{"credits": "0"}), http.StatusUnprocessableEntity, "RefundAiInference.InvalidAmount")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-g", map[string]any{"credits": "0.000000"}), http.StatusUnprocessableEntity, "RefundAiInference.InvalidAmount")
	for _, body := range []map[string]any{{"credits": "-1"}, {"credits": "1.0000001"}, {"credits": 1}, {"reason": strings.Repeat("r", 501)}, {"reason": ""}, {"unknown": true}} {
		require.Equal(t, http.StatusUnprocessableEntity, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-g", body).StatusCode, "%v", body)
	}

	// A key a plain numeric report of the pool already took.
	plain := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/instances/"+instance.Slug+"/entitlements/"+pool.Slug+"/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": -1}, "behavior": "append"}, map[string]string{"Idempotency-Key": "plain-report"})
	plainResponse, err := testServer.App.Test(plain, fiber.TestConfig{})
	require.NoError(t, err)
	commonfixture.MustCloseBody(t, plainResponse.Body)
	require.Equal(t, http.StatusOK, plainResponse.StatusCode)
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "plain-report", map[string]any{"credits": "1"}), http.StatusConflict, "RefundAiInference.IdempotencyKeyReused")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "plain-report", map[string]any{"credits": "2"}), http.StatusConflict, "RefundAiInference.IdempotencyKeyReused")

	// None of the refusals moved anything: only the plain report did.
	refused := readPoolMovement(t, instance.ID, pool.ID)
	require.Equal(t, poolMovement{counter: after.counter - 1, journal: after.journal + 1, accepted: after.accepted + 1, refunds: 1}, refused)

	// The remainder, by asking for no amount.
	rest := commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-2", nil), http.StatusOK)
	require.Equal(t, "5.5", rest.Credits)
	require.Nil(t, rest.Reason)
	require.Greater(t, rest.ReportSeq, partial.ReportSeq)
	done := readPoolMovement(t, instance.ID, pool.ID)
	require.InDelta(t, -5.5, done.counter-refused.counter, 0.0000005)
	require.Equal(t, refused.journal+1, done.journal)
	require.Equal(t, 2, done.refunds)
	// The same request under the same key replays, though nothing is left.
	again := aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-2", nil)
	require.Equal(t, "true", again.Header.Get("Idempotent-Replayed"))
	require.Equal(t, rest, commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, again, http.StatusOK))
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-3", nil), http.StatusConflict, "RefundAiInference.NothingToRefund")
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "refund-3", map[string]any{"credits": "0.000001"}), http.StatusConflict, "RefundAiInference.NothingToRefund")
	require.Equal(t, done, readPoolMovement(t, instance.ID, pool.ID))

	// The inference lists its refunds, oldest first, and their sum; the
	// charge itself is untouched. Another inference lists none.
	charged := inferenceOf(t, instance.Slug, pool.Slug, "charged")
	require.Equal(t, []instanceschema.AiInferenceRefund{partial, rest}, charged.Refunds)
	require.Equal(t, "9", *charged.Credits.Refunded)
	require.Equal(t, "9", *charged.Credits.Charged)
	require.Equal(t, "COMMITTED", charged.Status)
	other := inferenceOf(t, instance.Slug, pool.Slug, "other")
	require.NotNil(t, other.Refunds)
	require.Empty(t, other.Refunds)
	require.Nil(t, other.Credits.Refunded)
	raw, err := io.ReadAll(aiRead(t, instance.Slug, pool.Slug, "/inferences?transactionId=other").Body)
	require.NoError(t, err)
	require.Contains(t, string(raw), `"refunds":[]`)
	organization := organizationPage(t, nil, url.Values{"transactionId": {"charged"}})
	require.Len(t, organization.Items, 1)
	require.Equal(t, charged.Refunds, organization.Items[0].Refunds)
	require.Equal(t, "9", *organization.Items[0].Credits.Refunded)
	reservations := commonfixture.AssertJSONResponse[instanceschema.AiReservations](t, aiRead(t, instance.Slug, pool.Slug, "/reservations"), http.StatusOK)
	require.Len(t, reservations.Items, 1)
	require.NotNil(t, reservations.Items[0].Refunds)
}

// A refund lands in the window open when it is made. Once the charge's
// window has closed, it lowers the new window's counter, which is not
// floored at zero: what a negative report does.
func TestAIRefundAfterTheChargesWindowClosed(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	db := testServer.Dependencies.DB
	_, err := db.Exec(t.Context(), `UPDATE entitlement SET reset_period='MONTH',reset_anchor='CALENDAR' WHERE id=$1`, pool.ID)
	require.NoError(t, err)
	window, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)
	oldStart := window.Start.AddDate(0, -1, 0)

	chargedCommit(t, instance.Slug, pool.Slug, "last-month", 9)
	// The charge is moved into the previous window, with the counter it left.
	seedUsageRow(t, instance.Slug, pool.Slug, 9, 1, &oldStart)
	_, err = db.Exec(t.Context(), `UPDATE ai_inference SET reported_at=$2, committed_at=$2, window_start=$3 WHERE entitlement_id=$1`, pool.ID, window.Start.Add(-time.Hour), oldStart)
	require.NoError(t, err)
	require.Empty(t, rolloverEvents(t))

	refund := commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, aiRefund(t, instance.Slug, pool.Slug, "last-month", "late-refund", map[string]any{"credits": "4"}), http.StatusOK)

	closures := rolloverEvents(t)
	require.Len(t, closures, 1, "the refund's report closed the charge's window")
	require.Equal(t, 9.0, closures[0].Value, "the closed window keeps what it counted")
	require.True(t, closures[0].ClosedPeriodStart.Equal(oldStart))
	row := getUsageRow(t, instance.ID, pool.ID)
	require.True(t, row.PeriodStart.Time.Equal(window.Start))
	counter, err := entitlementvalue.ParseNumberUsageValue(row.Value)
	require.NoError(t, err)
	require.Equal(t, -4.0, counter.Value, "the open window's counter goes below zero")

	var journalWindow time.Time
	var before, value float64
	require.NoError(t, db.QueryRow(t.Context(), `SELECT window_start, value_before::float8, value_after::float8 FROM usage_ledger WHERE instance_id=$1 AND entitlement_id=$2 AND report_seq=$3`, instance.ID, pool.ID, refund.ReportSeq).Scan(&journalWindow, &before, &value))
	require.True(t, journalWindow.Equal(window.Start), "journalled in the window open when the refund was made")
	require.Zero(t, before)
	require.Equal(t, -4.0, value)

	inference := inferenceOf(t, instance.Slug, pool.Slug, "last-month")
	require.True(t, inference.WindowStart.Equal(oldStart), "the charge stays in its own window")
	require.Equal(t, "4", *inference.Credits.Refunded)
	require.Len(t, inference.Refunds, 1)

	// The rest can still be refunded, in the same open window.
	commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, aiRefund(t, instance.Slug, pool.Slug, "last-month", "late-refund-2", nil), http.StatusOK)
	counter, err = entitlementvalue.ParseNumberUsageValue(getUsageRow(t, instance.ID, pool.ID).Value)
	require.NoError(t, err)
	require.Equal(t, -9.0, counter.Value)
	require.Len(t, rolloverEvents(t), 1)
}

func TestAIRefundTenantScopeGateAndGrant(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	second := newInstances(t, 1)[0]
	chargedCommit(t, instance.Slug, pool.Slug, "charged", 9)
	start := readPoolMovement(t, instance.ID, pool.ID)

	// The same pool on another instance of the organization: not this pair.
	refundProblem(t, aiRefund(t, second.Slug, pool.Slug, "charged", "k-1", nil), http.StatusNotFound, "RefundAiInference.InferenceNotFound")

	// Another organization reads neither the instance nor the pool.
	neighbour := newNeighbourOrganization(t)
	theirs := tests.NewTestServer(testDb, tests.TestServerOptions{OrganizationID: &neighbour, PlatformFlags: aitest.Flags(true)})
	t.Cleanup(func() { require.NoError(t, theirs.Close()) })
	refundProblem(t, aiRefundOn(t, theirs.App, instance.Slug, pool.Slug, "charged", "k-2", nil), http.StatusNotFound, "RefundAiInference.ContextNotFound")

	// write:instances, the report's scope.
	readOnly := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{scope.Read(scope.Instances)}, PlatformFlags: aitest.Flags(true)})
	t.Cleanup(func() { require.NoError(t, readOnly.Close()) })
	refundProblem(t, aiRefundOn(t, readOnly.App, instance.Slug, pool.Slug, "charged", "k-3", nil), http.StatusForbidden, scope.ErrCodeMissingScope)

	// The AI gate, as for every AI use case on this branch.
	off := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(false)})
	t.Cleanup(func() { require.NoError(t, off.Close()) })
	refundProblem(t, aiRefundOn(t, off.App, instance.Slug, pool.Slug, "charged", "k-4", nil), http.StatusForbidden, "AIUsage.Disabled")

	require.Equal(t, start, readPoolMovement(t, instance.ID, pool.ID))

	// A writer with only the report's scope refunds.
	writer := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{scope.Write(scope.Instances)}, PlatformFlags: aitest.Flags(true)})
	t.Cleanup(func() { require.NoError(t, writer.Close()) })
	commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, aiRefundOn(t, writer.App, instance.Slug, pool.Slug, "charged", "k-5", map[string]any{"credits": "1"}), http.StatusOK)

	// A report needs the pool to be granted, and so does a refund: once the
	// licence no longer grants it, nothing is written.
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `DELETE FROM license_entitlement WHERE entitlement_id=$1 AND organization_id=$2`, pool.ID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	var refundsBefore int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference_refund WHERE entitlement_id=$1`, pool.ID).Scan(&refundsBefore))
	refundProblem(t, aiRefund(t, instance.Slug, pool.Slug, "charged", "k-6", nil), http.StatusConflict, "RefundAiInference.PoolNotGranted")
	var refundsAfter int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference_refund WHERE entitlement_id=$1`, pool.ID).Scan(&refundsAfter))
	require.Equal(t, refundsBefore, refundsAfter)
	// The replay of an accepted refund still answers.
	replay := aiRefund(t, instance.Slug, pool.Slug, "charged", "k-5", map[string]any{"credits": "1"})
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, http.StatusOK, replay.StatusCode)
	var payload json.RawMessage
	require.NoError(t, json.NewDecoder(replay.Body).Decode(&payload))
}

// concurrentRefunds starts the refunds together. Requests are built and
// asserted on the test goroutine, never inside a worker.
func concurrentRefunds(t *testing.T, instance, pool, transactionID string, keys ...string) []*http.Response {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 35*time.Second)
	defer cancel()
	type result struct {
		response *http.Response
		err      error
	}
	results := make(chan result, len(keys))
	ready := make(chan struct{}, len(keys))
	start := make(chan struct{})
	for _, key := range keys {
		request := commonfixture.NewJSONRequest(t, http.MethodPost, refundPath(instance, pool, transactionID), map[string]any{}, map[string]string{"Idempotency-Key": key}).WithContext(ctx)
		go func() {
			ready <- struct{}{}
			<-start
			response, err := testServer.App.Test(request, fiber.TestConfig{Timeout: 30 * time.Second})
			results <- result{response: response, err: err}
		}()
	}
	for range keys {
		<-ready
	}
	close(start)
	responses := make([]*http.Response, 0, len(keys))
	for range keys {
		select {
		case result := <-results:
			require.NoError(t, result.err)
			t.Cleanup(func() { commonfixture.MustCloseBody(t, result.response.Body) })
			responses = append(responses, result.response)
		case <-ctx.Done():
			t.Fatal("concurrent refunds exceeded deadline")
		}
	}
	return responses
}

// What is left to refund is read and consumed under the pair's lock: two
// refunds of everything refund once, and one request sent twice at once is
// one refund.
func TestAIConcurrentRefundsGiveBackTheChargeOnce(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	chargedCommit(t, instance.Slug, pool.Slug, "two-keys", 9)
	chargedCommit(t, instance.Slug, pool.Slug, "one-key", 4)
	start := readPoolMovement(t, instance.ID, pool.ID)

	accepted, refused := 0, 0
	for _, response := range concurrentRefunds(t, instance.Slug, pool.Slug, "two-keys", "key-a", "key-b") {
		if response.StatusCode == http.StatusOK {
			accepted++
			require.Equal(t, "9", commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, response, http.StatusOK).Credits)
		} else {
			refused++
			refundProblem(t, response, http.StatusConflict, "RefundAiInference.NothingToRefund")
		}
	}
	require.Equal(t, 1, accepted)
	require.Equal(t, 1, refused)

	replayed := 0
	var refunds []instanceschema.AiInferenceRefund
	for _, response := range concurrentRefunds(t, instance.Slug, pool.Slug, "one-key", "key-c", "key-c") {
		if response.Header.Get("Idempotent-Replayed") == "true" {
			replayed++
		}
		refunds = append(refunds, commonfixture.AssertJSONResponse[instanceschema.AiInferenceRefund](t, response, http.StatusOK))
	}
	require.Equal(t, 1, replayed)
	require.Equal(t, refunds[0], refunds[1])

	after := readPoolMovement(t, instance.ID, pool.ID)
	require.InDelta(t, -13.0, after.counter-start.counter, 0.0000005)
	require.Equal(t, poolMovement{counter: after.counter, journal: start.journal + 2, accepted: start.accepted + 2, refunds: 2}, after)
}
