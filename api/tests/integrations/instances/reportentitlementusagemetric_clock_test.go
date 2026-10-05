package instances_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// reportUsageOn sends one append report to app, which may be a server other
// than the suite's, and returns the response; the caller closes the body.
func reportUsageOn(t *testing.T, app *fiber.App, instanceSlug, entitlementSlug string, value float64) *http.Response {
	t.Helper()
	payload := map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"}
	req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", payload)
	resp, err := app.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	return resp
}

func readUsage(t *testing.T, instanceSlug, entitlementSlug string) schema.EntitlementUsage {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
}

// databaseNow reads the clock expression the usage path uses.
func databaseNow(t *testing.T) time.Time {
	t.Helper()
	now, err := instancedb.New(testServer.Dependencies.DB).GetDatabaseNow(t.Context())
	require.NoError(t, err)
	return now.Time.UTC()
}

func TestReportEntitlementUsageMetric_Clock(t *testing.T) {
	t.Run("WhenReadingTheClock_TruncatesToTheMillisecondAndAdvancesInsideATransaction", func(t *testing.T) {
		pool := testServer.Dependencies.DB

		// The defect the truncation fixes: a ::timestamp(3) cast rounds, which
		// moves the last half-millisecond of a window into the next one.
		var truncated, rounded time.Time
		require.NoError(t, pool.QueryRow(t.Context(),
			`SELECT date_trunc('milliseconds', TIMESTAMP '2026-10-31 23:59:59.999600')::timestamp(3),
			        TIMESTAMP '2026-10-31 23:59:59.999600'::timestamp(3)`,
		).Scan(&truncated, &rounded))
		require.Equal(t, time.Date(2026, 10, 31, 23, 59, 59, 999_000_000, time.UTC), truncated.UTC())
		require.Equal(t, time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), rounded.UTC())

		// clock_timestamp(), not the transaction's frozen now(): two reads in
		// one transaction differ.
		tx, err := pool.Begin(t.Context())
		require.NoError(t, err)
		defer func() { _ = tx.Rollback(context.Background()) }()

		queries := instancedb.New(tx)
		first, err := queries.GetDatabaseNow(t.Context())
		require.NoError(t, err)
		_, err = tx.Exec(t.Context(), "SELECT pg_sleep(0.005)")
		require.NoError(t, err)
		second, err := queries.GetDatabaseNow(t.Context())
		require.NoError(t, err)

		require.Zero(t, first.Time.Nanosecond()%int(time.Millisecond), "first read has sub-millisecond digits: %v", first.Time)
		require.Zero(t, second.Time.Nanosecond()%int(time.Millisecond), "second read has sub-millisecond digits: %v", second.Time)
		require.True(t, second.Time.After(first.Time), "clock did not advance inside the transaction: %v then %v", first.Time, second.Time)
	})

	t.Run("WhenStoredWindowIsAheadOfTheClock_KeepsItAsTheCurrentWindow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Hour, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		// A bucket opened one window ahead, as a report racing a boundary or a
		// clock stepped back across a failover leaves it. Before the fix the
		// next report walked forward from it looking for the current window and
		// never stopped.
		current, err := period.Current(databaseNow(t), period.Hour, period.Calendar, time.Time{})
		require.NoError(t, err)
		ahead := current.End
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 5, 5, &ahead)

		started := time.Now()
		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 1, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		usage := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Less(t, time.Since(started), 5*time.Second)

		require.InDelta(t, 6, usage.Value.Number.Value, 0)
		require.EqualValues(t, 6, usage.Value.Number.EventCount)
		require.NotNil(t, usage.CurrentPeriodStart)
		require.True(t, usage.CurrentPeriodStart.Equal(ahead), "currentPeriodStart = %v, want the stored window %v", usage.CurrentPeriodStart, ahead)
		require.True(t, usage.CurrentPeriodEnd.Equal(ahead.Add(time.Hour)))

		require.Empty(t, rolloverEvents(t), "a window ahead of the clock is not rolled over")
		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		require.True(t, row.PeriodStart.Time.Equal(ahead), "period_start = %v, want it kept at %v", row.PeriodStart.Time, ahead)

		// The gauge reads what the report wrote, in the same window.
		gauge := readUsage(t, instances[0].Slug, entitlement.Slug)
		require.InDelta(t, 6, gauge.Value.Number.Value, 0)
		require.True(t, gauge.CurrentPeriodStart.Equal(ahead), "gauge currentPeriodStart = %v, want %v", gauge.CurrentPeriodStart, ahead)
	})

	t.Run("WhenRolloverWouldExceedTheCap_Returns500AndWritesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		cappedServer := tests.NewTestServer(testDb, tests.TestServerOptions{
			ConfigOverride: func(cfg *config.Config) { cfg.Usage.RolloverMaxClosures = 5 },
		})
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Hour, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		current, err := period.Current(databaseNow(t), period.Hour, period.Calendar, time.Time{})
		require.NoError(t, err)
		dayAgo := current.Start.Add(-24 * time.Hour)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 3, 3, &dayAgo)

		resp := reportUsageOn(t, cappedServer.App, instances[0].Slug, entitlement.Slug, 1)
		defer commonfixture.MustCloseBody(t, resp.Body)
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusInternalServerError)
		require.Equal(t, "ReportEntitlementUsageMetric.RolloverLimitExceeded", problem.Code)

		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		require.True(t, row.PeriodStart.Time.Equal(dayAgo), "the rollover must roll back with the report")
		require.Empty(t, rolloverEvents(t))

		// Within the cap, the same server rolls the bucket over normally.
		fourHoursAgo := current.Start.Add(-4 * time.Hour)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 3, 3, &fourHoursAgo)
		ok := reportUsageOn(t, cappedServer.App, instances[0].Slug, entitlement.Slug, 1)
		defer commonfixture.MustCloseBody(t, ok.Body)
		require.Equal(t, fiber.StatusOK, ok.StatusCode)
		require.Len(t, rolloverEvents(t), 4)
	})

	// Two reports wait for the pair's lock across an HOUR boundary under
	// LICENSE_START. R1 begins its transaction before the boundary, R2 after;
	// both get the lock only once T releases it, after the boundary. With the
	// clock read after the lock, both land in the new window: the old window
	// closes with the one report it really held. With now() (the
	// transaction's BEGIN), R1 counted into the closed window instead.
	t.Run("WhenTwoReportsWaitAcrossAWindowBoundary_BothLandInTheNewWindow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		pool := testServer.Dependencies.DB

		// The boundary B is 4 s ahead of the database clock: the license starts
		// then, so the current window is [B-1h, B).
		dbNow := databaseNow(t)
		offset := time.Until(dbNow)
		boundary := dbNow.Add(4 * time.Second)
		at := func(fromBoundary time.Duration) time.Time { return boundary.Add(fromBoundary).Add(-offset) }

		instance := newInstanceWithStartLicenseDate(t, boundary)
		entitlement := newPeriodicEntitlement(t, period.Hour, period.LicenseStart)
		assignEntitlementToLicense(t, instance.LicenseSlug, entitlement.Slug, 1000)

		first := reportUsage(t, instance.Slug, entitlement.Slug, 1, "append")
		commonfixture.MustCloseBody(t, first.Body)
		require.Equal(t, fiber.StatusOK, first.StatusCode)

		require.True(t, time.Now().Before(at(-600*time.Millisecond)), "fixture setup took too long to reach the boundary in time")
		time.Sleep(time.Until(at(-600 * time.Millisecond)))

		holder, err := pool.BeginTx(t.Context(), pgx.TxOptions{})
		require.NoError(t, err)
		defer func() { _ = holder.Rollback(context.Background()) }()
		_, err = holder.Exec(t.Context(), "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0))", instance.ID, entitlement.ID)
		require.NoError(t, err)

		type outcome struct {
			status int
			err    error
		}
		send := func(results chan<- outcome) {
			payload := map[string]any{"value": map[string]any{"type": "number", "value": 1}, "behavior": "append"}
			req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			if err != nil {
				results <- outcome{err: err}
				return
			}
			_ = resp.Body.Close()
			results <- outcome{status: resp.StatusCode}
		}

		results := make(chan outcome, 2)
		time.Sleep(time.Until(at(-400 * time.Millisecond)))
		go send(results)
		time.Sleep(time.Until(at(100 * time.Millisecond)))
		go send(results)
		time.Sleep(time.Until(at(400 * time.Millisecond)))
		require.NoError(t, holder.Commit(t.Context()))

		for range 2 {
			select {
			case got := <-results:
				require.NoError(t, got.err)
				require.Equal(t, fiber.StatusOK, got.status)
			case <-time.After(10 * time.Second):
				t.Fatal("a report did not answer within 10 s of the boundary")
			}
		}

		payloads := rolloverEvents(t)
		require.Len(t, payloads, 1)
		require.False(t, payloads[0].IsSynthetic)
		require.True(t, payloads[0].ClosedPeriodStart.Equal(boundary.Add(-time.Hour)), "closed_period_start = %v", payloads[0].ClosedPeriodStart)
		require.True(t, payloads[0].ClosedPeriodEnd.Equal(boundary), "closed_period_end = %v", payloads[0].ClosedPeriodEnd)
		require.InDelta(t, 1, payloads[0].Value, 0, "the closed window held only the report made before the boundary")
		require.True(t, payloads[0].NewPeriodStart.Equal(boundary))

		row := getUsageRow(t, instance.ID, entitlement.ID)
		require.True(t, row.PeriodStart.Time.Equal(boundary), "period_start = %v, want %v", row.PeriodStart.Time, boundary)
		gauge := readUsage(t, instance.Slug, entitlement.Slug)
		require.InDelta(t, 2, gauge.Value.Number.Value, 0)
		require.EqualValues(t, 2, gauge.Value.Number.EventCount)
	})
}
