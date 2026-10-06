package instances_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// keyedReport is one response to a report sent with a transactionId.
type keyedReport struct {
	status   int
	replayed string
	body     []byte
}

// reportWithKey sends a report carrying transactionID to app (the suite's
// server when nil) and reads the whole response.
func reportWithKey(t *testing.T, app *fiber.App, instanceSlug, entitlementSlug, rawValue, behavior, transactionID string) keyedReport {
	t.Helper()
	if app == nil {
		app = testServer.App
	}
	body := fmt.Sprintf(`{"value":{"type":"number","value":%s},"behavior":%q,"transactionId":%q}`, rawValue, behavior, transactionID)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost,
		"/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	var out keyedReport
	out.status = resp.StatusCode
	out.replayed = resp.Header.Get("Idempotent-Replayed")
	out.body, err = io.ReadAll(resp.Body)
	require.NoError(t, err)
	return out
}

func (r keyedReport) usage(t *testing.T) schema.EntitlementUsage {
	t.Helper()
	require.Equal(t, fiber.StatusOK, r.status, "body: %s", r.body)
	var usage schema.EntitlementUsage
	require.NoError(t, json.Unmarshal(r.body, &usage))
	return usage
}

func (r keyedReport) problem(t *testing.T, status int) kaitenerrors.Problem {
	t.Helper()
	require.Equal(t, status, r.status, "body: %s", r.body)
	var problem kaitenerrors.Problem
	require.NoError(t, json.Unmarshal(r.body, &problem))
	return problem
}

// pairSnapshot is everything a report can write for a pair; equal snapshots
// mean nothing was written.
type pairSnapshot struct {
	rows      int
	counter   string
	reportSeq int64
	outbox    int
}

func snapshotPair(t *testing.T, instanceID, entitlementID uuid.UUID) pairSnapshot {
	t.Helper()
	var s pairSnapshot
	err := testServer.Dependencies.DB.QueryRow(t.Context(), `
		SELECT (SELECT count(*) FROM usage_ledger WHERE instance_id = $1 AND entitlement_id = $2),
		       coalesce((SELECT value::text || coalesce(period_start::text, '') FROM entitlement_usage WHERE instance_id = $1 AND entitlement_id = $2), ''),
		       coalesce((SELECT report_seq FROM entitlement_usage WHERE instance_id = $1 AND entitlement_id = $2), -1),
		       (SELECT count(*) FROM outbox_events WHERE organization_id = $3)`,
		instanceID, entitlementID, testDb.DefaultData.OrganizationID).Scan(&s.rows, &s.counter, &s.reportSeq, &s.outbox)
	require.NoError(t, err)
	return s
}

func TestReportEntitlementUsageMetric_TransactionID(t *testing.T) {
	t.Run("WhenTheKeyIsWellFormed_AppliesTheReportAndStoresTheKey", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		keys := []string{uuid.NewString(), "llm-call:9f2c:tokens", strings.Repeat("a", 128), "A.b_c-d:9", "x"}
		for _, key := range keys {
			got := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "1", "append", key)
			require.Equal(t, fiber.StatusOK, got.status, "key %q: %s", key, got.body)
			require.Empty(t, got.replayed, "a first application is not a replay")
		}

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, len(keys))
		for i, key := range keys {
			require.Equal(t, &key, rows[i].TransactionID)
		}
	})

	t.Run("WhenTheKeyIsMalformed_Returns422AndWritesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 1, "append")
		before := snapshotPair(t, instances[0].ID, entitlement.ID)

		for _, key := range []string{"", strings.Repeat("a", 129), "with space", "é", "a/b", "a\nb", "a*b"} {
			problem := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "1", "append", key).problem(t, fiber.StatusUnprocessableEntity)
			require.Equal(t, "ReportEntitlementUsageMetric.InvalidTransactionId", problem.Code, "key %q", key)
		}

		require.Equal(t, before, snapshotPair(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheSameReportIsSentAgain_ReplaysTheOriginalResponseAndWritesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 1000, 20)

		first := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "250", "append", "evt-0001").usage(t)
		after := snapshotPair(t, instances[0].ID, entitlement.ID)

		// The JSON spelling differs (250.0); the value does not.
		retry := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "250.0", "append", "evt-0001")
		require.Equal(t, "true", retry.replayed)
		require.Equal(t, first, retry.usage(t), "a replay answers the original response")
		require.Equal(t, after, snapshotPair(t, instances[0].ID, entitlement.ID), "a replay writes nothing")
	})

	t.Run("WhenTheKeyComesBackWithAnotherValue_Returns409NamingTheOriginal", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "5", "append", "evt-1").usage(t)
		before := snapshotPair(t, instances[0].ID, entitlement.ID)

		problem := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "6", "append", "evt-1").problem(t, fiber.StatusConflict)
		require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code)
		require.Len(t, problem.Errors, 1)
		require.Equal(t, "body.transactionId", problem.Errors[0].Location)
		original, ok := problem.Errors[0].Value.(map[string]any)
		require.True(t, ok, "errors[0].value = %#v", problem.Errors[0].Value)
		require.EqualValues(t, 1, original["reportSeq"])
		require.Equal(t, "append", original["behavior"])
		require.EqualValues(t, 5, original["value"])
		require.NotEmpty(t, original["reportedAt"])

		problem = reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "5", "set", "evt-1").problem(t, fiber.StatusConflict)
		require.Equal(t, "ReportEntitlementUsageMetric.TransactionIdReused", problem.Code, "a different behavior is a different report")

		require.Equal(t, before, snapshotPair(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenOneKeyFeedsTwoMetersOrTwoInstances_EachAppliesOnce", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 2)
		tokens := newEntitlement(t)
		requests := newEntitlement(t)
		for _, e := range []string{tokens.Slug, requests.Slug} {
			assignEntitlementToLicense(t, instances[0].LicenseSlug, e, 1000)
		}

		for _, target := range []struct{ instance, entitlement string }{
			{instances[0].Slug, tokens.Slug},
			{instances[0].Slug, requests.Slug},
			{instances[1].Slug, tokens.Slug},
		} {
			got := reportWithKey(t, nil, target.instance, target.entitlement, "1", "append", "llm-call:42")
			require.Equal(t, fiber.StatusOK, got.status)
			require.Empty(t, got.replayed, "the key is scoped to the instance and entitlement")
		}
		require.Len(t, ledgerRows(t, instances[0].ID, tokens.ID), 1)
		require.Len(t, ledgerRows(t, instances[0].ID, requests.ID), 1)
		require.Len(t, ledgerRows(t, instances[1].ID, tokens.ID), 1)
	})

	t.Run("WhenKeysDifferOnlyByCase_TheyAreTwoKeys", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		require.Empty(t, reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "1", "append", "Key-1").replayed)
		require.Empty(t, reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "1", "append", "key-1").replayed)
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 2)
	})

	t.Run("WhenTheReportWasRejected_TheKeyIsNotConsumed", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 90, "append")

		problem := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "20", "append", "batch-7").problem(t, fiber.StatusConflict)
		require.Equal(t, "ReportEntitlementUsageMetric.ThresholdExceeded", problem.Code)

		// Room is made, and the same report under the same key is evaluated
		// afresh rather than replayed or refused.
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 50, "set")
		retry := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "20", "append", "batch-7")
		require.Equal(t, fiber.StatusOK, retry.status, "body: %s", retry.body)
		require.Empty(t, retry.replayed)
		require.InDelta(t, 70, retry.usage(t).Value.Number.Value, 0)
	})

	t.Run("WhenTheWindowRolledOverSinceTheReport_TheReplayAnswersTheOriginalWindowAndRollsNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Hour, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "3", "append", "evt-roll").usage(t)

		// Pretend the report was accepted in the previous hour and nothing has
		// been reported since: the stored bucket is now stale.
		current, err := period.Current(databaseNow(t), period.Hour, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.Add(-time.Hour)
		_, err = testServer.Dependencies.DB.Exec(t.Context(), `
			UPDATE usage_ledger SET window_start = $3, window_end = $4, reported_at = reported_at - interval '1 hour'
			WHERE instance_id = $1 AND entitlement_id = $2`, instances[0].ID, entitlement.ID, previous, current.Start)
		require.NoError(t, err)
		setPeriodStart(t, instances[0].ID, entitlement.ID, previous)
		before := snapshotPair(t, instances[0].ID, entitlement.ID)

		retry := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "3", "append", "evt-roll")
		require.Equal(t, "true", retry.replayed)
		usage := retry.usage(t)
		require.True(t, usage.CurrentPeriodStart.Equal(previous), "the original window, not the current one")
		require.InDelta(t, 3, usage.Value.Number.Value, 0)
		require.Empty(t, rolloverEvents(t), "a replay never rolls a stale bucket over")
		require.Equal(t, before, snapshotPair(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheKeyIsOlderThanTheHorizon_TheReportIsAppliedAgain", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		dayServer := tests.NewTestServer(testDb, tests.TestServerOptions{
			ConfigOverride: func(cfg *config.Config) { cfg.Usage.IdempotencyWindow = 24 * time.Hour },
		})
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		reportWithKey(t, dayServer.App, instances[0].Slug, entitlement.Slug, "4", "append", "old-key").usage(t)

		_, err := testServer.Dependencies.DB.Exec(t.Context(),
			`UPDATE usage_ledger SET reported_at = reported_at - interval '25 hours' WHERE instance_id = $1 AND entitlement_id = $2`,
			instances[0].ID, entitlement.ID)
		require.NoError(t, err)

		again := reportWithKey(t, dayServer.App, instances[0].Slug, entitlement.Slug, "4", "append", "old-key")
		require.Empty(t, again.replayed, "the horizon is the contract")
		require.InDelta(t, 8, again.usage(t).Value.Number.Value, 0)
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 2)
	})

	t.Run("WhenIdenticalRequestsRace_TheReportAppliesOnce", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		const n = 10
		results := make([]keyedReport, n)
		var wg sync.WaitGroup
		for i := range n {
			wg.Go(func() {
				results[i] = reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "7", "append", "dup-key")
			})
		}
		wg.Wait()

		replays := 0
		for _, r := range results {
			require.Equal(t, fiber.StatusOK, r.status, "body: %s", r.body)
			if r.replayed == "true" {
				replays++
			}
		}
		require.Equal(t, n-1, replays, "one application, every other request a replay")
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 1)
		require.InDelta(t, 7, readUsage(t, instances[0].Slug, entitlement.Slug).Value.Number.Value, 0)
	})

	t.Run("WhenOneKeyRacesWithDifferentValues_ExactlyOneApplies", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		const n = 8
		results := make([]keyedReport, n)
		var wg sync.WaitGroup
		for i := range n {
			wg.Go(func() {
				results[i] = reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, fmt.Sprint(i+1), "append", "contested")
			})
		}
		wg.Wait()

		applied := 0
		for _, r := range results {
			switch r.status {
			case fiber.StatusOK:
				require.Empty(t, r.replayed)
				applied++
			case fiber.StatusConflict:
			default:
				t.Fatalf("unexpected status %d: %s", r.status, r.body)
			}
		}
		require.Equal(t, 1, applied)
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 1)
	})

	t.Run("WhenTheGrantIsUnlimitedAndTheCounterLifetime_TheReplayKeepsThoseShapes", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, -1, -1)

		first := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "12", "append", "evt-u").usage(t)
		retry := reportWithKey(t, nil, instances[0].Slug, entitlement.Slug, "12", "append", "evt-u")
		require.Equal(t, "true", retry.replayed)
		replayed := retry.usage(t)
		require.Equal(t, first, replayed)
		require.Nil(t, replayed.CurrentPeriodStart)
		require.InDelta(t, -1, replayed.Limit.Number.Value, 0)
	})
}

// TestReportEntitlementUsageMetric_EventInstant checks that every event a report
// writes carries the instant the report was dated, read after its lock.
func TestReportEntitlementUsageMetric_EventInstant(t *testing.T) {
	t.Run("WhenAReportWaitsForTheLock_ItIsDatedWhenItGetsIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		holder, err := testServer.Dependencies.DB.Begin(t.Context())
		require.NoError(t, err)
		defer func() { _ = holder.Rollback(context.Background()) }()
		_, err = holder.Exec(t.Context(), "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0))", instances[0].ID, entitlement.ID)
		require.NoError(t, err)

		done := make(chan int, 1)
		go func() {
			resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 1, "append")
			_ = resp.Body.Close()
			done <- resp.StatusCode
		}()
		time.Sleep(1500 * time.Millisecond)
		released := databaseNow(t)
		require.NoError(t, holder.Commit(t.Context()))
		require.Equal(t, fiber.StatusOK, <-done)

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		require.False(t, rows[0].ReportedAt.Before(released), "reported_at %v is before the lock was released at %v", rows[0].ReportedAt, released)
		require.Equal(t, rows[0].ReportedAt, eventInstant(t, instanceEvents.EntitlementUsageReportAccepted.Name))
	})

	t.Run("WhenAReportRollsOverAndCrossesTheCap_EveryEventCarriesItsInstant", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Hour, period.Calendar)
		// Soft: accepted up to 150, so crossing 100 emits CAP_EXCEEDED.
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 100, 50)
		setWarningThreshold(t, entitlement.ID, 80)

		current, err := period.Current(databaseNow(t), period.Hour, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.Add(-2 * time.Hour)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 10, 1, &previous)
		time.Sleep(50 * time.Millisecond) // let the transaction's BEGIN fall behind the report's clock

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 120, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		for _, name := range []string{
			instanceEvents.InstanceEntitlementUsagePeriodRolledOver.Name,
			instanceEvents.EntitlementUsageReportAccepted.Name,
			instanceEvents.InstanceEntitlementCapExceeded.Name,
			instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name,
		} {
			require.Equal(t, rows[0].ReportedAt, eventInstant(t, name), "%s is not dated with the report", name)
		}
	})

	t.Run("WhenAReportIsRejected_ItsEventIsDatedLikeAnAcceptedOne", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		before := databaseNow(t)
		requireStatus(t, fiber.StatusConflict, instances[0].Slug, entitlement.Slug, 20, "append")
		after := databaseNow(t)

		got := eventInstant(t, instanceEvents.EntitlementUsageReportRejected.Name)
		require.False(t, got.Before(before) || got.After(after), "REJECTED dated %v, outside [%v, %v]", got, before, after)
		require.Zero(t, got.Nanosecond()%int(time.Millisecond), "dated with the millisecond-truncated usage clock")
	})
}

// eventInstant returns occurred_at shared by every outbox event named name,
// failing when there is none or when they disagree.
func eventInstant(t *testing.T, name string) time.Time {
	t.Helper()
	var instants []time.Time
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName == name {
			instants = append(instants, event.OccurredAt.Time.UTC())
		}
	}
	require.NotEmpty(t, instants, "no event named %s", name)
	for _, instant := range instants[1:] {
		require.Equal(t, instants[0], instant, "events named %s carry different instants", name)
	}
	return instants[0]
}

func setPeriodStart(t *testing.T, instanceID, entitlementID uuid.UUID, start time.Time) {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE entitlement_usage SET period_start = $3 WHERE instance_id = $1 AND entitlement_id = $2`,
		instanceID, entitlementID, start)
	require.NoError(t, err)
}

func setWarningThreshold(t *testing.T, entitlementID uuid.UUID, percent int) {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE entitlement SET warning_threshold_percent = $2 WHERE id = $1`, entitlementID, percent)
	require.NoError(t, err)
}
