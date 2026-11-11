package instances_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	instancesmodule "github.com/kaitencloud/kaiten/api/internal/modules/instances"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	fixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// outageFlags answers true until down is set, then fails like an unreachable
// or timed-out platform flag source.
type outageFlags struct{ down atomic.Bool }

func (f *outageFlags) BooleanValue(context.Context, uuid.UUID, string) (bool, error) {
	if f.down.Load() {
		return false, errors.New("platform flag source unavailable")
	}
	return true, nil
}

func aiInferenceStatus(t *testing.T, instanceID, poolID uuid.UUID, transactionID string) (status string) {
	t.Helper()
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT status::text FROM ai_inference WHERE organization_id=$1 AND instance_id=$2 AND entitlement_id=$3 AND transaction_id=$4`, testDb.DefaultData.OrganizationID, instanceID, poolID, transactionID).Scan(&status))
	return status
}

func TestFlagSourceOutageRefusesReservationsButNeverLosesACommit(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	path := "/api/instances/" + instance.Slug + "/entitlements/" + pool.Slug + "/usage"
	// Reserved while the source was healthy; the inference then runs during the outage.
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "in-flight", 3)), 200)

	post := func(server *tests.TestServer, body map[string]any) *http.Response {
		response, err := server.App.Test(fixture.NewJSONRequest(t, http.MethodPost, path, map[string]any{"value": body}), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { fixture.MustCloseBody(t, response.Body) })
		return response
	}

	t.Run("a replica that never saw this organization", func(t *testing.T) {
		source := &outageFlags{}
		source.down.Store(true)
		cold := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aiusage.NewCachedFlags(source, time.Minute)})
		t.Cleanup(func() { require.NoError(t, cold.Close()) })

		problem := fixture.AssertJSONResponse[apierrors.Problem](t, post(cold, aiUsageBody("reserve", "cold-reserve", 1)), 403)
		require.Equal(t, "AIUsage.Disabled", problem.Code)

		journal := len(ledgerRows(t, instance.ID, pool.ID))
		fixture.AssertJSONResponse[schema.EntitlementUsage](t, post(cold, aiUsageBody("commit", "in-flight", 3)), 200)
		require.Equal(t, "COMMITTED", aiInferenceStatus(t, instance.ID, pool.ID, "in-flight"))
		require.Len(t, ledgerRows(t, instance.ID, pool.ID), journal+1, "the charge is in the journal")

		unreserved := aiUsageBody("commit", "cold-unreserved", 2)
		unreserved["model"], unreserved["requestType"] = "lifecycle-model", "COMPLETION"
		fixture.AssertJSONResponse[schema.EntitlementUsage](t, post(cold, unreserved), 200)
		require.Equal(t, "COMMITTED", aiInferenceStatus(t, instance.ID, pool.ID, "cold-unreserved"))
	})

	t.Run("a replica that knew the flag was on", func(t *testing.T) {
		source := &outageFlags{}
		warm := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aiusage.NewCachedFlags(source, time.Minute)})
		t.Cleanup(func() { require.NoError(t, warm.Close()) })
		fixture.AssertJSONResponse[schema.EntitlementUsage](t, post(warm, aiUsageBody("reserve", "warm-before", 1)), 200)

		source.down.Store(true)
		fixture.AssertJSONResponse[schema.EntitlementUsage](t, post(warm, aiUsageBody("reserve", "warm-during", 1)), 200)
		fixture.AssertJSONResponse[schema.EntitlementUsage](t, post(warm, aiUsageBody("commit", "warm-during", 1)), 200)
		require.Equal(t, "COMMITTED", aiInferenceStatus(t, instance.ID, pool.ID, "warm-during"))
	})
}

func TestAIRowsDoNotBlockInstanceOrCustomerDeletionWhileOff(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "left-open", 1)), 200)
	unreserved := aiUsageBody("commit", "settled", 2)
	unreserved["model"], unreserved["requestType"] = "lifecycle-model", "COMPLETION"
	fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, unreserved), 200)

	off := tests.NewTestServer(testDb)
	t.Cleanup(func() { require.NoError(t, off.Close()) })
	for _, target := range []string{"/api/instances/" + instance.Slug, "/api/customers/" + instance.CustomerSlug} {
		response, err := off.App.Test(httptest.NewRequest(http.MethodDelete, target, nil), fiber.TestConfig{})
		require.NoError(t, err)
		require.Equal(t, fiber.StatusNoContent, response.StatusCode, target)
		fixture.MustCloseBody(t, response.Body)
	}
}

func TestExpirySweepClosesOverdueHoldsWithoutAskingTheFlag(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	for _, id := range []string{"overdue", "still-open"} {
		fixture.AssertJSONResponse[schema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", id, 1)), 200)
	}
	// From here nothing holds an enabled flag for this organization: the sweep
	// takes a database handle and no policy.
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE ai_inference SET reported_at = reported_at - interval '1 hour', expires_at = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE organization_id=$1 AND transaction_id='overdue'`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	expired, err := instancesmodule.ExpireAIReservations(t.Context(), testServer.Dependencies.DB)
	require.NoError(t, err)
	require.EqualValues(t, 1, expired)
	require.Equal(t, "EXPIRED", aiInferenceStatus(t, instance.ID, pool.ID, "overdue"))
	require.Equal(t, "RESERVED", aiInferenceStatus(t, instance.ID, pool.ID, "still-open"))

	expired, err = instancesmodule.ExpireAIReservations(t.Context(), testServer.Dependencies.DB)
	require.NoError(t, err)
	require.Zero(t, expired, "a second pass finds nothing")
}
