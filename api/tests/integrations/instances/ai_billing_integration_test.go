package instances_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
	"github.com/stretchr/testify/require"
)

func TestAIBillingJournalAndPhaseReplay(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 10)
	reserve := aiUsageBody("reserve", "journal-op", 3)
	commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	require.Empty(t, ledgerRows(t, instance.ID, pool.ID))
	commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	require.Empty(t, ledgerRows(t, instance.ID, pool.ID))

	commit := aiUsageBody("commit", "journal-op", 4)
	accepted := commonfixture.AssertJSONResponse[reportentitlementusagemetric.ReportedEntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.NotNil(t, accepted.Source)
	require.NotNil(t, accepted.Provenance)
	require.Nil(t, accepted.TransactionID)
	rows := ledgerRows(t, instance.ID, pool.ID)
	require.Len(t, rows, 1)
	require.EqualValues(t, 1, rows[0].ReportSeq)
	require.Equal(t, "4", rows[0].ReportedValue)
	require.Equal(t, "0", rows[0].ValueBefore)
	require.Equal(t, "4", rows[0].ValueAfter)
	require.EqualValues(t, 1, rows[0].EventCountAfter)
	require.Nil(t, rows[0].TransactionID)
	require.EqualValues(t, 1, counterReportSeq(t, instance.ID, pool.ID))
	require.Equal(t, ptrString("10"), rows[0].LimitValue)

	// Change the grant: a replay must still return the original snapshot, not
	// null provenance or the effective value of the new grant.
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE license_entitlement SET value='{"type":"number","value":100}' WHERE license_id=$1 AND entitlement_id=$2`, instance.LicenseID, pool.ID)
	require.NoError(t, err)
	events := recordedEvents(t)
	response := aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", response.Header.Get("Idempotent-Replayed"))
	replay := commonfixture.AssertJSONResponse[reportentitlementusagemetric.ReportedEntitlementUsage](t, response, http.StatusOK)
	require.Equal(t, accepted, replay)
	require.Equal(t, rows, ledgerRows(t, instance.ID, pool.ID))
	require.Equal(t, events, recordedEvents(t))
	require.EqualValues(t, 1, counterReportSeq(t, instance.ID, pool.ID))

	commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "release-op", 1)), http.StatusOK)
	release := aiUsageBody("commit", "release-op", 0)
	release["requestStatus"] = "NOT_SENT"
	commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, release), http.StatusOK)
	commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, release), http.StatusOK)
	require.Equal(t, rows, ledgerRows(t, instance.ID, pool.ID))
	require.EqualValues(t, 1, counterReportSeq(t, instance.ID, pool.ID))
}

func TestAIRejectsNumericIdempotencyNamespace(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 20)
	headers := map[string]string{"Idempotency-Key": "shared-key"}
	for _, id := range []string{"shared-key", "another-op", "shared-key"} {
		body := aiUsageBody("commit", id, 2)
		body["model"], body["requestType"] = "lifecycle-model", "COMPLETION"
		problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, body, headers), http.StatusUnprocessableEntity)
		require.Equal(t, "ReportEntitlementUsageMetric.AiIdempotencyKeyUnsupported", problem.Code)
	}
	require.Empty(t, ledgerRows(t, instance.ID, pool.ID))
	var operations int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM ai_inference WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&operations))
	require.Zero(t, operations)

	// Rejected AI headers neither consume nor replay a numeric key.
	numeric := reportWithKey(t, nil, instance.Slug, pool.Slug, "2", "append", "shared-key")
	require.Equal(t, http.StatusOK, numeric.status)
	require.Empty(t, numeric.replayed)
	body := aiUsageBody("commit", "shared-key", 2)
	body["model"], body["requestType"] = "lifecycle-model", "COMPLETION"
	commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, body), http.StatusOK)
	require.EqualValues(t, 2, counterReportSeq(t, instance.ID, pool.ID))
	require.Len(t, ledgerRows(t, instance.ID, pool.ID), 2)
	replay := reportWithKey(t, nil, instance.Slug, pool.Slug, "2", "append", "shared-key")
	require.Equal(t, "true", replay.replayed)
	var numericReplay reportentitlementusagemetric.ReportedEntitlementUsage
	require.NoError(t, json.Unmarshal(replay.body, &numericReplay))
	require.Equal(t, 2.0, numericReplay.Value.Number.Value)
	require.Nil(t, numericReplay.Source)
	require.Nil(t, numericReplay.Provenance)
	require.EqualValues(t, 2, counterReportSeq(t, instance.ID, pool.ID))
}

func TestAIGateUsesBillingAddonLimit(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 2)
	// Create only test-owned catalogue/attachment rows. No provider or live stack.
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `WITH f AS (
 INSERT INTO addon_family (organization_id,slug) VALUES ($1,'ai-limit-addon') RETURNING id
 ), a AS (
 INSERT INTO addon (organization_id,family_id,name,slug,description,version,lifecycle_state,pricing_type,created_by_id,updated_by_id)
 SELECT $1,id,'AI limit','ai-limit-addon','test',1,'PUBLISHED','FREE',$2,$2 FROM f RETURNING id,family_id
 ), g AS (
 INSERT INTO addon_entitlement (organization_id,addon_id,entitlement_id,value,limit_cap_exceeded_overage_percent,override_behavior,created_by_id,updated_by_id)
 SELECT $1,id,$4,'{"type":"number","value":3}',0,'ADD',$2,$2 FROM a
 )
 INSERT INTO instance_addon (organization_id,instance_id,addon_id,addon_family_id,created_by_id,updated_by_id)
 SELECT $1,$3,id,family_id,$2,$2 FROM a`, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, instance.ID, pool.ID)
	require.NoError(t, err)
	accepted := commonfixture.AssertJSONResponse[reportentitlementusagemetric.ReportedEntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "addon-gate", 5)), http.StatusOK)
	require.Equal(t, 5.0, accepted.Limit.Number.Value)
	require.NotNil(t, accepted.Provenance)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "addon-over", 1)), http.StatusConflict)
	require.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)
	commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "addon-gate", 5)), http.StatusOK)
	rows := ledgerRows(t, instance.ID, pool.ID)
	require.Len(t, rows, 1)
	require.Equal(t, ptrString("5"), rows[0].LimitValue)
	// Journal, AI evidence and events are stamped at the same post-lock instant.
	var committedAt time.Time
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT committed_at FROM ai_inference WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&committedAt))
	require.True(t, rows[0].ReportedAt.Equal(committedAt))
	// History reads must continue to resolve the effective grant when only the
	// add-on grants the pool; they must not require a licence_entitlement row.
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `DELETE FROM license_entitlement WHERE license_id=$1 AND entitlement_id=$2`, instance.LicenseID, pool.ID)
	require.NoError(t, err)
	get := func(suffix string) *http.Response {
		response, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+instance.Slug+"/entitlements/"+pool.Slug+"/usage/"+suffix, nil), fiber.TestConfig{Timeout: 30 * time.Second})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, response.Body) })
		return response
	}
	events := recordedEvents(t)
	history := commonfixture.AssertJSONResponse[schema.AiInferencePage](t, get("inferences"), http.StatusOK)
	require.Len(t, history.Items, 1)
	reservations := commonfixture.AssertJSONResponse[schema.AiReservations](t, get("reservations"), http.StatusOK)
	require.Empty(t, reservations.Items)
	require.Equal(t, events, recordedEvents(t))
	require.Equal(t, rows, ledgerRows(t, instance.ID, pool.ID))

}

// Billing checks the grant after replay lookup. AI must keep the same ordering
// for both immutable phase snapshots even when no effective grant remains.
func TestAIPhaseReplayAfterEffectiveGrantRemoval(t *testing.T) {
	for _, phase := range []string{"reserve", "commit"} {
		t.Run(phase, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance, pool := newAIUsagePair(t, 10)
			body := aiUsageBody("reserve", "removed-grant", 3)
			original := commonfixture.AssertJSONResponse[reportentitlementusagemetric.ReportedEntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, body), http.StatusOK)
			if phase == "commit" {
				body = aiUsageBody("commit", "removed-grant", 4)
				original = commonfixture.AssertJSONResponse[reportentitlementusagemetric.ReportedEntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, body), http.StatusOK)
			}
			_, err := testServer.Dependencies.DB.Exec(t.Context(), `DELETE FROM license_entitlement WHERE entitlement_id=$1`, pool.ID)
			require.NoError(t, err)
			var grants int
			require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM instance_effective_entitlement WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&grants))
			require.Zero(t, grants, "the replay must not depend on any remaining grant layer")
			before := snapshotPair(t, instance.ID, pool.ID)
			evidenceQuery := `SELECT jsonb_build_object('row',to_jsonb(a),'xmin',a.xmin::text) FROM ai_inference a WHERE instance_id=$1 AND entitlement_id=$2`
			evidence := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, evidenceQuery, instance.ID, pool.ID)
			retry := aiReport(t, instance.Slug, pool.Slug, body)
			require.Equal(t, "true", retry.Header.Get("Idempotent-Replayed"))
			require.Equal(t, original, commonfixture.AssertJSONResponse[reportentitlementusagemetric.ReportedEntitlementUsage](t, retry, http.StatusOK))
			require.Equal(t, before, snapshotPair(t, instance.ID, pool.ID), "replay adds no ledger/outbox row and does not change the counter or sequence")
			require.Equal(t, evidence, commonfixture.RowSnapshot(t, testServer.Dependencies.DB, evidenceQuery, instance.ID, pool.ID), "phase evidence and reservation TTL are immutable")
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "new-after-removal", 1)), http.StatusNotFound)
			require.Equal(t, "ReportEntitlementUsageMetric.ContextNotFound", problem.Code, "new work still needs a grant")
		})
	}
}
