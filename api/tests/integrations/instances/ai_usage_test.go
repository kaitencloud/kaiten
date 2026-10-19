package instances_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func aiReport(t *testing.T, instance, pool string, value map[string]any) *http.Response {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instance+"/entitlements/"+pool+"/usage", map[string]any{"value": value}), fiber.TestConfig{})
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
