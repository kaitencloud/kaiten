package instances_test

import (
	"context"
	"fmt"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/errgroup"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// ledgerRow is a usage_ledger row as the tests read it: the NUMERIC columns as
// their exact text.
type ledgerRow struct {
	OrganizationID    uuid.UUID
	LicenseID         uuid.UUID
	ReportSeq         int64
	ReportedAt        time.Time
	WindowStart       *time.Time
	WindowEnd         *time.Time
	Behavior          string
	AggregationMethod string
	ReportedValue     string
	ValueBefore       string
	ValueAfter        string
	EventCountAfter   int32
	LimitValue        *string
	OveragePercent    int16
	TransactionID     *string
	Properties        []byte
}

func ledgerRows(t *testing.T, instanceID, entitlementID uuid.UUID) []ledgerRow {
	t.Helper()
	rows, err := testServer.Dependencies.DB.Query(t.Context(), `
		SELECT organization_id, license_id, report_seq, reported_at, window_start, window_end,
		       behavior::text, aggregation_method::text, reported_value::text, value_before::text,
		       value_after::text, event_count_after, limit_value::text, overage_percent,
		       transaction_id, properties
		FROM usage_ledger
		WHERE instance_id = $1 AND entitlement_id = $2
		ORDER BY report_seq`, instanceID, entitlementID)
	require.NoError(t, err)
	defer rows.Close()

	var out []ledgerRow
	for rows.Next() {
		var r ledgerRow
		require.NoError(t, rows.Scan(&r.OrganizationID, &r.LicenseID, &r.ReportSeq, &r.ReportedAt, &r.WindowStart, &r.WindowEnd,
			&r.Behavior, &r.AggregationMethod, &r.ReportedValue, &r.ValueBefore, &r.ValueAfter, &r.EventCountAfter,
			&r.LimitValue, &r.OveragePercent, &r.TransactionID, &r.Properties))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

func counterReportSeq(t *testing.T, instanceID, entitlementID uuid.UUID) int64 {
	t.Helper()
	var seq int64
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT report_seq FROM entitlement_usage WHERE instance_id = $1 AND entitlement_id = $2`,
		instanceID, entitlementID).Scan(&seq))
	return seq
}

func setCounterReportSeq(t *testing.T, instanceID, entitlementID uuid.UUID, seq int64) {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE entitlement_usage SET report_seq = $3 WHERE instance_id = $1 AND entitlement_id = $2`,
		instanceID, entitlementID, seq)
	require.NoError(t, err)
}

// requireStatus sends one report and checks its status, closing the body.
func requireStatus(t *testing.T, want int, instanceSlug, entitlementSlug string, value float64, behavior string) {
	t.Helper()
	resp := reportUsage(t, instanceSlug, entitlementSlug, value, behavior)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, want, resp.StatusCode, "report %s %v", behavior, value)
}

func ptrString(s string) *string { return &s }

func TestReportEntitlementUsageMetric_Ledger(t *testing.T) {
	t.Run("WhenAReportIsAccepted_WritesOneRowWithEveryColumn", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 1000, 20)

		before := databaseNow(t)
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 250, "append")
		after := databaseNow(t)

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		row := rows[0]
		window, err := period.Current(before, period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)

		require.Equal(t, testDb.DefaultData.OrganizationID, row.OrganizationID)
		require.Equal(t, instances[0].LicenseID, row.LicenseID)
		require.EqualValues(t, 1, row.ReportSeq)
		require.False(t, row.ReportedAt.Before(before), "reported_at %v before %v", row.ReportedAt, before)
		require.False(t, row.ReportedAt.After(after), "reported_at %v after %v", row.ReportedAt, after)
		require.Zero(t, row.ReportedAt.Nanosecond()%int(time.Millisecond), "reported_at has sub-millisecond digits")
		require.True(t, row.WindowStart.Equal(window.Start))
		require.True(t, row.WindowEnd.Equal(window.End))
		require.Equal(t, "append", row.Behavior)
		require.Equal(t, "SUM", row.AggregationMethod)
		require.Equal(t, "250", row.ReportedValue)
		require.Equal(t, "0", row.ValueBefore)
		require.Equal(t, "250", row.ValueAfter)
		require.EqualValues(t, 1, row.EventCountAfter)
		require.Equal(t, ptrString("1000"), row.LimitValue)
		require.EqualValues(t, 20, row.OveragePercent)
		require.Nil(t, row.TransactionID)
		require.Nil(t, row.Properties)

		require.EqualValues(t, 1, counterReportSeq(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenTheEntitlementIsALifetimeCounter_TheRowHasNoWindow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 1, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		require.Nil(t, rows[0].WindowStart)
		require.Nil(t, rows[0].WindowEnd)
		require.Equal(t, ptrString("10"), rows[0].LimitValue)
		require.EqualValues(t, 0, rows[0].OveragePercent)
	})

	t.Run("WhenTheGrantIsUnlimited_TheRowHasNoLimitAndPercentMinusOne", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, -1, -1)

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 1_000_000, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		require.Nil(t, rows[0].LimitValue)
		require.EqualValues(t, -1, rows[0].OveragePercent)
	})

	t.Run("WhenAReportIsRejected_NoRowAndNoSequence", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 80, "append")
		requireStatus(t, fiber.StatusConflict, instances[0].Slug, entitlement.Slug, 30, "append")
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 20, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 2)
		require.EqualValues(t, 1, rows[0].ReportSeq)
		require.EqualValues(t, 2, rows[1].ReportSeq)
		require.Equal(t, "80", rows[1].ValueBefore, "the rejected report left no trace in the chain")
		require.Equal(t, "100", rows[1].ValueAfter)
		require.EqualValues(t, 2, counterReportSeq(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenSetCorrectsTheCounter_DeltasSumToTheCounterNotToTheReportedValues", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 10, "append")
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 20, "append")
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 25, "set")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 3)
		got := make([]string, len(rows))
		for i, r := range rows {
			got[i] = fmt.Sprintf("%d %s %s:%s->%s ec%d", r.ReportSeq, r.Behavior, r.ReportedValue, r.ValueBefore, r.ValueAfter, r.EventCountAfter)
		}
		require.Equal(t, []string{
			"1 append 10:0->10 ec1",
			"2 append 20:10->30 ec2",
			"3 set 25:30->25 ec1",
		}, got)

		var sumDelta, sumReported string
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT sum(value_after - value_before)::text, sum(reported_value)::text FROM usage_ledger WHERE instance_id = $1 AND entitlement_id = $2`,
			instances[0].ID, entitlement.ID).Scan(&sumDelta, &sumReported))
		require.Equal(t, "25", sumDelta)
		require.Equal(t, "55", sumReported, "summing the reported values would bill 55 for a counter at 25")
	})

	t.Run("WhenValuesAreDecimal_TheJournalIsExactToTheFloat", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 0.1, "append")
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 0.2, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 2)
		require.Equal(t, "0.1", rows[1].ValueBefore)
		require.Equal(t, "0.30000000000000004", rows[1].ValueAfter, "the float64 counter, digit for digit")
	})

	t.Run("WhenTheStoredBucketRollsOver_TheRowStartsTheNewWindowAndTheResetCountsNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Hour, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		current, err := period.Current(databaseNow(t), period.Hour, period.Calendar, time.Time{})
		require.NoError(t, err)
		staleStart := current.Start.Add(-5 * time.Hour)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 3, 3, &staleStart)
		setCounterReportSeq(t, instances[0].ID, entitlement.ID, 3)

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 1, "append")

		require.Len(t, rolloverEvents(t), 5)
		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1, "five closed windows, one report: one row")
		require.EqualValues(t, 4, rows[0].ReportSeq, "the rollover reset does not count as a report")
		require.True(t, rows[0].WindowStart.Equal(current.Start))
		require.Equal(t, "0", rows[0].ValueBefore)
		require.Equal(t, "1", rows[0].ValueAfter)
		require.EqualValues(t, 4, counterReportSeq(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenARejectedReportRollsOver_TheRolloverStaysAndTheNextReportChainsFromZero", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Hour, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)

		current, err := period.Current(databaseNow(t), period.Hour, period.Calendar, time.Time{})
		require.NoError(t, err)
		previous := current.Start.Add(-time.Hour)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 90, 4, &previous)
		setCounterReportSeq(t, instances[0].ID, entitlement.ID, 4)

		requireStatus(t, fiber.StatusConflict, instances[0].Slug, entitlement.Slug, 130, "append")

		require.Len(t, rolloverEvents(t), 1)
		require.Empty(t, ledgerRows(t, instances[0].ID, entitlement.ID))
		require.EqualValues(t, 4, counterReportSeq(t, instances[0].ID, entitlement.ID))
		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		require.True(t, row.PeriodStart.Time.Equal(current.Start), "the rollover is persisted even though the report is not")

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 20, "append")
		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		require.EqualValues(t, 5, rows[0].ReportSeq)
		require.Equal(t, "0", rows[0].ValueBefore)
		require.Equal(t, "20", rows[0].ValueAfter)
	})

	t.Run("WhenACounterPredatesTheJournal_TheFirstRowCarriesOneAndChainsFromIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		// A counter the previous release wrote: no report_seq (0), no rows.
		current, err := period.Current(databaseNow(t), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 40, 4, &current.Start)
		require.EqualValues(t, 0, counterReportSeq(t, instances[0].ID, entitlement.ID))

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 10, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 1)
		require.EqualValues(t, 1, rows[0].ReportSeq)
		require.Equal(t, "40", rows[0].ValueBefore)
		require.Equal(t, "50", rows[0].ValueAfter)
		require.EqualValues(t, 5, rows[0].EventCountAfter)
	})

	t.Run("WhenTheInstanceChangesLicence_TheRowNamesTheVersionThatAcceptedIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 300, "append")

		other := newLicense(t)
		assignEntitlementToLicense(t, other.Slug, entitlement.Slug, 1000)
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE instance SET license_id = $1 WHERE id = $2`, other.ID, instances[0].ID)
		require.NoError(t, err)

		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 1, "append")

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, 2)
		require.Equal(t, instances[0].LicenseID, rows[0].LicenseID)
		require.Equal(t, other.ID, rows[1].LicenseID)
		require.Equal(t, "300", rows[1].ValueBefore, "usage carries over the licence change")
		require.Equal(t, "301", rows[1].ValueAfter)
	})

	t.Run("WhenReportsArriveConcurrently_TheSequenceIsContiguousAndTheDatesNeverGoBack", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		const reportCount = 64
		var reports errgroup.Group
		for range reportCount {
			reports.Go(func() error {
				req := httptest.NewRequest(http.MethodPost,
					"/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage",
					strings.NewReader(`{"value":{"type":"number","value":1},"behavior":"append"}`))
				req.Header.Set("Content-Type", "application/json")
				resp, err := testServer.App.Test(req, fiber.TestConfig{})
				if err != nil {
					return err
				}
				_ = resp.Body.Close()
				if resp.StatusCode != fiber.StatusOK {
					return fmt.Errorf("report usage: unexpected status %d", resp.StatusCode)
				}
				return nil
			})
		}
		require.NoError(t, reports.Wait())

		rows := ledgerRows(t, instances[0].ID, entitlement.ID)
		require.Len(t, rows, reportCount)
		for i, r := range rows {
			require.EqualValues(t, i+1, r.ReportSeq)
			require.Equal(t, fmt.Sprint(i), r.ValueBefore)
			require.Equal(t, fmt.Sprint(i+1), r.ValueAfter)
			if i > 0 {
				require.False(t, r.ReportedAt.Before(rows[i-1].ReportedAt), "row %d dated before row %d", i+1, i)
			}
		}
		require.EqualValues(t, reportCount, counterReportSeq(t, instances[0].ID, entitlement.ID))
	})

	t.Run("WhenNoPartitionCoversTheInstant_Returns503AndWritesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		requireStatus(t, fiber.StatusOK, instances[0].Slug, entitlement.Slug, 5, "append")

		pool := testServer.Dependencies.DB
		var partition string
		require.NoError(t, pool.QueryRow(t.Context(),
			`SELECT 'usage_ledger_p' || to_char(now() AT TIME ZONE 'UTC', 'YYYY_MM')`).Scan(&partition))
		_, err := pool.Exec(t.Context(), `ALTER TABLE usage_ledger DETACH PARTITION "`+partition+`"`)
		require.NoError(t, err)
		t.Cleanup(func() {
			_, err := pool.Exec(context.Background(), `ALTER TABLE usage_ledger ATTACH PARTITION "`+partition+`"
				FOR VALUES FROM (date_trunc('month', now() AT TIME ZONE 'UTC')) TO (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month')`)
			require.NoError(t, err)
		})
		acceptedBefore := countOutboxEvents(t, instanceEvents.EntitlementUsageReportAccepted.Name)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 1, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusServiceUnavailable)
		require.Equal(t, "ReportEntitlementUsageMetric.LedgerUnavailable", problem.Code)

		require.EqualValues(t, 1, counterReportSeq(t, instances[0].ID, entitlement.ID), "the counter rolled back with the journal row")
		gauge := readUsage(t, instances[0].Slug, entitlement.Slug)
		require.InDelta(t, 5, gauge.Value.Number.Value, 0)
		require.Equal(t, acceptedBefore, countOutboxEvents(t, instanceEvents.EntitlementUsageReportAccepted.Name))
	})
}

// TestReportEntitlementUsageMetric_LedgerInvariants drives random sequences of
// appends, sets, rejections and concurrent bursts through the endpoint, then
// checks what the journal promises: report_seq runs 1..n without a gap, each
// row starts where the one before it ended, and the deltas add up to the
// counter.
func TestReportEntitlementUsageMetric_LedgerInvariants(t *testing.T) {
	for _, seed := range []uint64{1, 2, 3} {
		t.Run(fmt.Sprintf("seed=%d", seed), func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			rng := rand.New(rand.NewPCG(seed, seed)) //nolint:gosec // a seeded, reproducible test sequence, not a secret
			instances := newInstances(t, 1)
			entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
			// A hard limit low enough that some reports are rejected.
			assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 200)

			values := []float64{0.5, 1, 2.25, 7, 13.125, 40}
			accepted := 0
			for range 40 {
				burst := 1 + rng.IntN(4)
				var reports errgroup.Group
				statuses := make(chan int, burst)
				for range burst {
					behavior := "append"
					if rng.IntN(5) == 0 {
						behavior = "set"
					}
					value := values[rng.IntN(len(values))]
					if behavior == "set" {
						value = float64(rng.IntN(260))
					}
					reports.Go(func() error {
						resp := reportUsage(t, instances[0].Slug, entitlement.Slug, value, behavior)
						statuses <- resp.StatusCode
						return resp.Body.Close()
					})
				}
				require.NoError(t, reports.Wait())
				close(statuses)
				for status := range statuses {
					require.Contains(t, []int{fiber.StatusOK, fiber.StatusConflict}, status)
					if status == fiber.StatusOK {
						accepted++
					}
				}
			}

			rows := ledgerRows(t, instances[0].ID, entitlement.ID)
			require.Len(t, rows, accepted, "one row per accepted report, none per rejected one")
			for i, r := range rows {
				require.EqualValues(t, i+1, r.ReportSeq, "report_seq has a gap or a repeat")
				if i > 0 {
					require.Equal(t, rows[i-1].ValueAfter, r.ValueBefore, "row %d does not start where row %d ended", i+1, i)
				}
			}
			require.Equal(t, "0", rows[0].ValueBefore)

			// Compared as NUMERIC: the sum carries the scale of its terms
			// (194.000), the counter its own (194).
			var sumDelta, counter string
			var sumMatches, lastMatches bool
			require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
				WITH ledger AS (
				  SELECT sum(value_after - value_before) AS sum_delta,
				         (array_agg(value_after ORDER BY report_seq DESC))[1] AS last_after
				  FROM usage_ledger WHERE instance_id = $1 AND entitlement_id = $2
				), counter AS (
				  SELECT (value->>'value')::numeric AS value FROM entitlement_usage WHERE instance_id = $1 AND entitlement_id = $2
				)
				SELECT ledger.sum_delta::text, counter.value::text,
				       ledger.sum_delta = counter.value, ledger.last_after = counter.value
				FROM ledger, counter`,
				instances[0].ID, entitlement.ID).Scan(&sumDelta, &counter, &sumMatches, &lastMatches))
			require.True(t, sumMatches, "the deltas add up to %s, the counter is %s", sumDelta, counter)
			require.True(t, lastMatches, "the last value_after is not the counter %s", counter)
			require.EqualValues(t, accepted, counterReportSeq(t, instances[0].ID, entitlement.ID))
		})
	}
}
