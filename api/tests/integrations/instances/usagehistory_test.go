package instances_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/listusagereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// historyResponse is one whole response from a usage history endpoint.
type historyResponse struct {
	status int
	header http.Header
	body   []byte
}

func historyGet(t *testing.T, app *fiber.App, path string, query url.Values) historyResponse {
	t.Helper()
	if app == nil {
		app = testServer.App
	}
	target := "/api" + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)
	require.NoError(t, err)
	resp, err := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return historyResponse{status: resp.StatusCode, header: resp.Header, body: body}
}

func (r historyResponse) page(t *testing.T) listusagereports.UsageReportPage {
	t.Helper()
	require.Equal(t, fiber.StatusOK, r.status, "body: %s", r.body)
	var page listusagereports.UsageReportPage
	require.NoError(t, json.Unmarshal(r.body, &page))
	return page
}

func (r historyResponse) problem(t *testing.T, status int, code string) kaitenerrors.Problem {
	t.Helper()
	require.Equal(t, status, r.status, "body: %s", r.body)
	var problem kaitenerrors.Problem
	require.NoError(t, json.Unmarshal(r.body, &problem))
	require.Equal(t, code, problem.Code, "body: %s", r.body)
	return problem
}

func reportsPath(instanceSlug, entitlementSlug string) string {
	return "/instances/" + instanceSlug + "/entitlements/" + entitlementSlug + "/usage/reports"
}

func rfc3339(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }

// ensureLedgerPartition creates the partition of at's month when the
// migration did not: it only covers the previous month onward.
func ensureLedgerPartition(t *testing.T, at time.Time) {
	t.Helper()
	month := time.Date(at.Year(), at.Month(), 1, 0, 0, 0, 0, time.UTC)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), fmt.Sprintf(
		`CREATE TABLE IF NOT EXISTS "usage_ledger_p%04d_%02d" PARTITION OF usage_ledger FOR VALUES FROM ('%s') TO ('%s')`,
		month.Year(), int(month.Month()), month.Format(time.DateTime), month.AddDate(0, 1, 0).Format(time.DateTime)))
	require.NoError(t, err)
}

// insertLedgerRow journals one synthetic append of 1 on the pair at
// reportedAt, as report seq.
func insertLedgerRow(t *testing.T, organizationID, instanceID, entitlementID uuid.UUID, seq int64, reportedAt time.Time) {
	t.Helper()
	ensureLedgerPartition(t, reportedAt)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id, report_seq,
		                          reported_at, behavior, aggregation_method, reported_value, value_before,
		                          value_after, event_count_after, overage_percent)
		VALUES ($1, $2, $3, $4, $5::bigint, $6, 'append', 'SUM', 1, $5::bigint - 1, $5::bigint, $5::int, -1)`,
		organizationID, instanceID, entitlementID, uuid.New(), seq, reportedAt.UTC())
	require.NoError(t, err)
}

// fixedRetention answers every organization's usage-history-retention with
// value, or err.
type fixedRetention struct {
	value json.RawMessage
	err   error
}

func (f fixedRetention) ConfigValue(context.Context, uuid.UUID, string) (json.RawMessage, error) {
	return f.value, f.err
}

func newRetentionServer(t *testing.T, reader fixedRetention) *tests.TestServer {
	t.Helper()
	srv := tests.NewTestServer(testDb, tests.TestServerOptions{EntitlementConfig: reader})
	t.Cleanup(func() { _ = srv.Close() })
	return srv
}

func TestListUsageReports(t *testing.T) {
	t.Run("WhenReportsWereAccepted_ListsThemInOrderWithExactDecimals", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicenseWithOverage(t, instance.LicenseSlug, entitlement.Slug, 1000, 50)

		resp, body := rawReport(t, instance.Slug, entitlement.Slug,
			`{"value":{"type":"number","value":600},"behavior":"append","transactionId":"evt-1","metadata":{"model":"m"}}`)
		require.Equal(t, fiber.StatusOK, resp.StatusCode, "body: %s", body)
		requireStatus(t, fiber.StatusOK, instance.Slug, entitlement.Slug, 500, "append")
		requireStatus(t, fiber.StatusOK, instance.Slug, entitlement.Slug, 450, "set")
		requireStatus(t, fiber.StatusOK, instance.Slug, entitlement.Slug, 0.1, "append")

		first := historyGet(t, nil, reportsPath(instance.Slug, entitlement.Slug), url.Values{"limit": {"2"}}).page(t)
		require.Len(t, first.Items, 2)
		require.NotNil(t, first.NextAfterSeq)
		require.EqualValues(t, 2, *first.NextAfterSeq)

		one := first.Items[0]
		require.EqualValues(t, 1, one.ReportSeq)
		require.Equal(t, instance.ID, one.InstanceID)
		require.Equal(t, entitlement.ID, one.EntitlementID)
		require.Equal(t, instance.LicenseID, one.LicenseID)
		require.Equal(t, "append", one.Behavior)
		require.Equal(t, "SUM", one.AggregationMethod)
		require.Equal(t, "600", one.ReportedValue)
		require.Equal(t, "0", one.ValueBefore)
		require.Equal(t, "600", one.ValueAfter)
		require.Equal(t, "600", one.Delta)
		require.Equal(t, "0", one.OverageDelta)
		require.EqualValues(t, 1, one.EventCountAfter)
		require.Equal(t, ptrString("1000"), one.LimitValue)
		require.NotNil(t, one.OveragePercent)
		require.EqualValues(t, 50, *one.OveragePercent)
		require.NotNil(t, one.WindowStart)
		require.NotNil(t, one.WindowEnd)
		require.Equal(t, ptrString("evt-1"), one.TransactionID)
		require.Equal(t, map[string]any{"model": "m"}, one.Properties)

		two := first.Items[1]
		require.Equal(t, "1100", two.ValueAfter)
		require.Equal(t, "500", two.Delta)
		require.Equal(t, "100", two.OverageDelta, "100 above the limit of 1000")
		require.Nil(t, two.TransactionID)
		require.Nil(t, two.Properties)

		second := historyGet(t, nil, reportsPath(instance.Slug, entitlement.Slug),
			url.Values{"limit": {"2"}, "afterSeq": {"2"}}).page(t)
		require.Len(t, second.Items, 2)
		require.Nil(t, second.NextAfterSeq, "the last page")
		require.Equal(t, "set", second.Items[0].Behavior)
		require.Equal(t, "-650", second.Items[0].Delta, "a set that lowered the counter")
		require.Equal(t, "-100", second.Items[0].OverageDelta, "back under the limit")
		require.Equal(t, "450.1", second.Items[1].ValueAfter)
		require.Equal(t, "0.1", second.Items[1].Delta)
	})

	t.Run("WhenFilteredByTransactionId_ListsThatReportOnly", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instance.LicenseSlug, entitlement.Slug, 1000)
		requireStatus(t, fiber.StatusOK, instance.Slug, entitlement.Slug, 1, "append")
		reportWithKey(t, nil, instance.Slug, entitlement.Slug, "2", "append", "evt-2").usage(t)
		requireStatus(t, fiber.StatusOK, instance.Slug, entitlement.Slug, 3, "append")

		page := historyGet(t, nil, reportsPath(instance.Slug, entitlement.Slug), url.Values{"transactionId": {"evt-2"}}).page(t)
		require.Len(t, page.Items, 1)
		require.EqualValues(t, 2, page.Items[0].ReportSeq)
		require.Nil(t, page.Items[0].WindowStart, "a lifetime counter has no window")
	})

	t.Run("WhenTheRangeExcludesReports_TheyAreNotListed", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		now := databaseNow(t)
		org := testDb.DefaultData.OrganizationID
		insertLedgerRow(t, org, instance.ID, entitlement.ID, 1, now.Add(-40*24*time.Hour))
		insertLedgerRow(t, org, instance.ID, entitlement.ID, 2, now.Add(-2*time.Hour))
		insertLedgerRow(t, org, instance.ID, entitlement.ID, 3, now.Add(-time.Hour))

		page := historyGet(t, nil, reportsPath(instance.Slug, entitlement.Slug), nil).page(t)
		require.Len(t, page.Items, 2, "the default range is the last 30 days")

		page = historyGet(t, nil, reportsPath(instance.Slug, entitlement.Slug), url.Values{
			"from": {rfc3339(now.Add(-50 * 24 * time.Hour))},
			"to":   {rfc3339(now.Add(-time.Hour))},
		}).page(t)
		require.Len(t, page.Items, 2, "from is inclusive, to exclusive")
		require.EqualValues(t, 1, page.Items[0].ReportSeq)
		require.EqualValues(t, 2, page.Items[1].ReportSeq)
	})

	t.Run("WhenTheRequestIsInvalid_ItIsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		now := databaseNow(t)
		path := reportsPath(instance.Slug, entitlement.Slug)

		historyGet(t, nil, path, url.Values{"from": {rfc3339(now)}, "to": {rfc3339(now.Add(-time.Hour))}}).
			problem(t, fiber.StatusUnprocessableEntity, "ListUsageReports.InvalidRange")
		historyGet(t, nil, path, url.Values{"from": {rfc3339(now)}, "to": {rfc3339(now)}}).
			problem(t, fiber.StatusUnprocessableEntity, "ListUsageReports.InvalidRange")
		historyGet(t, nil, reportsPath("nope", entitlement.Slug), nil).
			problem(t, fiber.StatusNotFound, "ListUsageReports.InstanceNotFound")
		historyGet(t, nil, reportsPath(instance.Slug, "nope"), nil).
			problem(t, fiber.StatusNotFound, "ListUsageReports.EntitlementNotFound")

		for _, limit := range []string{"0", "501"} {
			resp := historyGet(t, nil, path, url.Values{"limit": {limit}})
			require.Equal(t, fiber.StatusUnprocessableEntity, resp.status, "limit=%s: %s", limit, resp.body)
		}
		resp := historyGet(t, nil, path, url.Values{"from": {"yesterday"}})
		require.Equal(t, fiber.StatusUnprocessableEntity, resp.status, "body: %s", resp.body)
	})

	t.Run("WhenTheCallerLacksReadInstances_ItIsForbidden", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		path := reportsPath(instance.Slug, entitlement.Slug)

		licensesOnly := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{scope.Read(scope.Licenses)}})
		t.Cleanup(func() { _ = licensesOnly.Close() })
		for _, p := range []string{path, path + "/export", "/usage/reports/export"} {
			require.Equal(t, fiber.StatusForbidden, historyGet(t, licensesOnly.App, p, nil).status, p)
		}

		writer := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{scope.Write(scope.Instances)}})
		t.Cleanup(func() { _ = writer.Close() })
		require.Equal(t, fiber.StatusOK, historyGet(t, writer.App, path, nil).status, "write implies read")
	})
}

func TestUsageHistoryRetention(t *testing.T) {
	// Rows at c - 1 h and now - 10 days, with c the start of a 3-month
	// retention.
	setup := func(t *testing.T) (instanceSlug, entitlementSlug string, c time.Time) {
		t.Helper()
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		now := databaseNow(t)
		c = period.AddMonths(now, -3)
		org := testDb.DefaultData.OrganizationID
		insertLedgerRow(t, org, instance.ID, entitlement.ID, 1, c.Add(-time.Hour))
		insertLedgerRow(t, org, instance.ID, entitlement.ID, 2, now.Add(-10*24*time.Hour))
		return instance.Slug, entitlement.Slug, c
	}

	t.Run("WhenFromIsBeforeTheLicensedRetention_TheReadsRefuseIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instanceSlug, entitlementSlug, c := setup(t)
		srv := newRetentionServer(t, fixedRetention{value: json.RawMessage(`{"months":3}`)})
		path := reportsPath(instanceSlug, entitlementSlug)
		before := url.Values{"from": {rfc3339(c.Add(-time.Millisecond))}}

		problem := historyGet(t, srv.App, path, before).problem(t, fiber.StatusUnprocessableEntity, "ListUsageReports.OutsideRetention")
		require.Len(t, problem.Errors, 1)
		start, err := time.Parse(time.RFC3339Nano, fmt.Sprint(problem.Errors[0].Value))
		require.NoError(t, err, "errors[0].value is the retention start")
		require.WithinDuration(t, c, start, 5*time.Second)

		export := historyGet(t, srv.App, path+"/export", before)
		export.problem(t, fiber.StatusUnprocessableEntity, "ExportUsageReports.OutsideRetention")
		require.Contains(t, export.header.Get("Content-Type"), "application/problem+json", "no CSV bytes")
		historyGet(t, srv.App, "/usage/reports/export", before).
			problem(t, fiber.StatusUnprocessableEntity, "ExportUsageReports.OutsideRetention")

		page := historyGet(t, srv.App, path, url.Values{"from": {rfc3339(c.Add(time.Second))}}).page(t)
		require.Len(t, page.Items, 1, "from inside the retention")
		require.EqualValues(t, 2, page.Items[0].ReportSeq)

		page = historyGet(t, srv.App, path, nil).page(t)
		require.Len(t, page.Items, 1, "a defaulted range never fails on retention")
	})

	t.Run("WhenTheDefaultFromIsBeforeTheRetention_ItMovesUpToIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instanceSlug, entitlementSlug, c := setup(t)
		srv := newRetentionServer(t, fixedRetention{value: json.RawMessage(`{"months":3}`)})

		// to = c + 1 day puts the default from 29 days before c.
		page := historyGet(t, srv.App, reportsPath(instanceSlug, entitlementSlug),
			url.Values{"to": {rfc3339(c.Add(24 * time.Hour))}}).page(t)
		require.Empty(t, page.Items, "the row at c - 1 h is outside the retention")

		historyGet(t, srv.App, reportsPath(instanceSlug, entitlementSlug),
			url.Values{"to": {rfc3339(c.Add(-time.Minute))}}).
			problem(t, fiber.StatusUnprocessableEntity, "ListUsageReports.OutsideRetention")
	})

	t.Run("WhenTheRetentionCannotBeRead_NothingIsRestricted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instanceSlug, entitlementSlug, c := setup(t)
		srv := newRetentionServer(t, fixedRetention{err: errors.New("licensing deployment unreachable")})

		page := historyGet(t, srv.App, reportsPath(instanceSlug, entitlementSlug),
			url.Values{"from": {rfc3339(c.Add(-2 * time.Hour))}}).page(t)
		require.Len(t, page.Items, 2)
	})

	t.Run("WhenNoLicensingAuthority_TheConfiguredRetentionApplies", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instanceSlug, entitlementSlug, c := setup(t)
		srv := tests.NewTestServer(testDb, tests.TestServerOptions{
			ConfigOverride: func(cfg *config.Config) { cfg.UsageLedger.RetentionMonths = 3 },
		})
		t.Cleanup(func() { _ = srv.Close() })

		historyGet(t, srv.App, reportsPath(instanceSlug, entitlementSlug),
			url.Values{"from": {rfc3339(c.Add(-2 * time.Hour))}}).
			problem(t, fiber.StatusUnprocessableEntity, "ListUsageReports.OutsideRetention")

		page := historyGet(t, nil, reportsPath(instanceSlug, entitlementSlug),
			url.Values{"from": {rfc3339(c.Add(-2 * time.Hour))}}).page(t)
		require.Len(t, page.Items, 2, "the suite's server keeps the history forever")
	})
}

func TestExportUsageReports(t *testing.T) {
	t.Run("WhenFormatIsCSV_StreamsAHeaderAndOneLinePerReport", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instance.LicenseSlug, entitlement.Slug, 1000)
		resp, body := rawReport(t, instance.Slug, entitlement.Slug,
			`{"value":{"type":"number","value":5},"behavior":"append","transactionId":"-cmd","metadata":{"note":"a,b\"c"}}`)
		require.Equal(t, fiber.StatusOK, resp.StatusCode, "body: %s", body)
		requireStatus(t, fiber.StatusOK, instance.Slug, entitlement.Slug, 2.5, "append")

		export := historyGet(t, nil, reportsPath(instance.Slug, entitlement.Slug)+"/export", url.Values{"format": {"csv"}})
		require.Equal(t, fiber.StatusOK, export.status, "body: %s", export.body)
		require.Equal(t, "text/csv; charset=utf-8", export.header.Get("Content-Type"))
		require.Regexp(t, `^attachment; filename="usage-`+instance.Slug+`-`+entitlement.Slug+`-\d{8}-\d{8}\.csv"$`,
			export.header.Get("Content-Disposition"))

		lines := strings.Split(string(export.body), "\n")
		require.Len(t, lines, 4, "header, two reports, and the final newline: %s", export.body)
		require.True(t, strings.HasPrefix(lines[0], "organization_id,instance_id,entitlement_id,report_seq,reported_at,"))
		require.Empty(t, lines[3])
		org := testDb.DefaultData.OrganizationID.String()
		require.True(t, strings.HasPrefix(lines[1], org+","+instance.ID.String()+","+entitlement.ID.String()+",1,"), lines[1])
		require.True(t, strings.HasSuffix(lines[1], `,'-cmd,"{""note"":""a,b\""c""}"`), "formula-safe key, RFC 4180 quoting: %s", lines[1])
		require.Contains(t, lines[2], ",2.5,5,7.5,2.5,", "reported, before, after and delta")
	})

	t.Run("WhenFormatIsJSON_EachLineIsAListItem", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instance.LicenseSlug, entitlement.Slug, 1000)
		for range 3 {
			requireStatus(t, fiber.StatusOK, instance.Slug, entitlement.Slug, 1, "append")
		}
		path := reportsPath(instance.Slug, entitlement.Slug)

		export := historyGet(t, nil, path+"/export", url.Values{"format": {"json"}})
		require.Equal(t, fiber.StatusOK, export.status, "body: %s", export.body)
		require.Equal(t, "application/x-ndjson", export.header.Get("Content-Type"))

		listed := historyGet(t, nil, path, nil).page(t)
		lines := strings.Split(strings.TrimSuffix(string(export.body), "\n"), "\n")
		require.Len(t, lines, len(listed.Items))
		for i, line := range lines {
			var item usagehistory.UsageReport
			require.NoError(t, json.Unmarshal([]byte(line), &item))
			require.Equal(t, listed.Items[i], item)
		}
	})

	t.Run("WhenAPageIsFull_TheNextIsRead", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		now := databaseNow(t)
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id, report_seq,
			                          reported_at, behavior, aggregation_method, reported_value, value_before,
			                          value_after, event_count_after, overage_percent)
			SELECT $1, $2, $3, gen_random_uuid(), gs.n, $4::timestamp - make_interval(secs => 12001 - gs.n),
			       'append', 'SUM', 1, gs.n - 1, gs.n::numeric, gs.n::int, -1
			FROM generate_series(1, 12000) AS gs(n)`,
			testDb.DefaultData.OrganizationID, instance.ID, entitlement.ID, now)
		require.NoError(t, err)

		export := historyGet(t, nil, reportsPath(instance.Slug, entitlement.Slug)+"/export", url.Values{"format": {"csv"}})
		require.Equal(t, fiber.StatusOK, export.status)
		lines := strings.Split(strings.TrimSuffix(string(export.body), "\n"), "\n")
		require.Len(t, lines, 12001, "three pages of 5000, header included")
		for i, line := range lines[1:] {
			require.Contains(t, line, fmt.Sprintf(",%d,", i+1), "report_seq %d in order, without a gap", i+1)
		}
	})

	t.Run("WhenTheRequestIsInvalid_ItIsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		now := databaseNow(t)
		path := reportsPath(instance.Slug, entitlement.Slug) + "/export"

		historyGet(t, nil, path, url.Values{"format": {"xml"}}).
			problem(t, fiber.StatusUnprocessableEntity, "ExportUsageReports.InvalidFormat")
		historyGet(t, nil, path, url.Values{"from": {rfc3339(now.Add(-367 * 24 * time.Hour))}}).
			problem(t, fiber.StatusUnprocessableEntity, "ExportUsageReports.RangeTooLarge")
		historyGet(t, nil, path, url.Values{"from": {rfc3339(now)}, "to": {rfc3339(now.Add(-time.Hour))}}).
			problem(t, fiber.StatusUnprocessableEntity, "ExportUsageReports.InvalidRange")
		historyGet(t, nil, reportsPath("nope", entitlement.Slug)+"/export", nil).
			problem(t, fiber.StatusNotFound, "ExportUsageReports.InstanceNotFound")
		historyGet(t, nil, reportsPath(instance.Slug, "nope")+"/export", nil).
			problem(t, fiber.StatusNotFound, "ExportUsageReports.EntitlementNotFound")
	})
}

func TestExportOrganizationUsageReports(t *testing.T) {
	t.Run("WhenUnfiltered_ExportsEveryPairInReportedAtOrder", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		now := databaseNow(t)
		org := testDb.DefaultData.OrganizationID
		a, b, e := uuid.New(), uuid.New(), uuid.New()
		insertLedgerRow(t, org, a, e, 1, now.Add(-3*time.Hour))
		insertLedgerRow(t, org, b, e, 1, now.Add(-2*time.Hour))
		insertLedgerRow(t, org, a, e, 2, now.Add(-time.Hour))
		// Another organization's rows never appear.
		insertLedgerRow(t, newNeighbourOrganization(t), uuid.New(), e, 1, now.Add(-time.Hour))

		export := historyGet(t, nil, "/usage/reports/export", url.Values{"format": {"json"}})
		require.Equal(t, fiber.StatusOK, export.status, "body: %s", export.body)
		require.Regexp(t, `^attachment; filename="usage-\d{8}-\d{8}\.ndjson"$`, export.header.Get("Content-Disposition"))

		var got [][2]any
		for _, line := range strings.Split(strings.TrimSuffix(string(export.body), "\n"), "\n") {
			var item usagehistory.UsageReport
			require.NoError(t, json.Unmarshal([]byte(line), &item))
			got = append(got, [2]any{item.InstanceID, item.ReportSeq})
		}
		require.Equal(t, [][2]any{{a, int64(1)}, {b, int64(1)}, {a, int64(2)}}, got)
	})

	t.Run("WhenFiltered_ExportsTheNamedInstanceOrEntitlement", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		entitlement := newEntitlement(t)
		now := databaseNow(t)
		org := testDb.DefaultData.OrganizationID
		deleted := uuid.New() // an instance that no longer exists; its rows survive it
		insertLedgerRow(t, org, instance.ID, entitlement.ID, 1, now.Add(-2*time.Hour))
		insertLedgerRow(t, org, deleted, entitlement.ID, 1, now.Add(-time.Hour))
		insertLedgerRow(t, org, deleted, uuid.New(), 1, now.Add(-time.Hour))

		countLines := func(query url.Values) int {
			query.Set("format", "csv")
			export := historyGet(t, nil, "/usage/reports/export", query)
			require.Equal(t, fiber.StatusOK, export.status, "body: %s", export.body)
			return strings.Count(string(export.body), "\n") - 1
		}
		require.Equal(t, 3, countLines(url.Values{}))
		require.Equal(t, 1, countLines(url.Values{"instanceSlug": {instance.Slug}}))
		require.Equal(t, 2, countLines(url.Values{"instanceId": {deleted.String()}}))
		require.Equal(t, 2, countLines(url.Values{"entitlementSlug": {entitlement.Slug}}))
		require.Equal(t, 1, countLines(url.Values{"instanceId": {deleted.String()}, "entitlementId": {entitlement.ID.String()}}))
		require.Equal(t, 1, countLines(url.Values{"instanceSlug": {instance.Slug}, "instanceId": {instance.ID.String()}}))

		historyGet(t, nil, "/usage/reports/export", url.Values{"instanceSlug": {"nope"}}).
			problem(t, fiber.StatusNotFound, "ExportUsageReports.InstanceNotFound")
		historyGet(t, nil, "/usage/reports/export", url.Values{"entitlementSlug": {"nope"}}).
			problem(t, fiber.StatusNotFound, "ExportUsageReports.EntitlementNotFound")
		historyGet(t, nil, "/usage/reports/export", url.Values{"instanceSlug": {instance.Slug}, "instanceId": {deleted.String()}}).
			problem(t, fiber.StatusNotFound, "ExportUsageReports.InstanceNotFound")
		resp := historyGet(t, nil, "/usage/reports/export", url.Values{"instanceId": {"not-a-uuid"}})
		require.Equal(t, fiber.StatusUnprocessableEntity, resp.status, "body: %s", resp.body)
	})

	t.Run("WhenTheRangeIsLongerThan31Days_ItIsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		now := databaseNow(t)
		historyGet(t, nil, "/usage/reports/export", url.Values{"from": {rfc3339(now.Add(-32 * 24 * time.Hour))}}).
			problem(t, fiber.StatusUnprocessableEntity, "ExportUsageReports.RangeTooLarge")
		resp := historyGet(t, nil, "/usage/reports/export", url.Values{
			"from": {rfc3339(now.Add(-31 * 24 * time.Hour))}, "to": {rfc3339(now)},
		})
		require.Equal(t, fiber.StatusOK, resp.status, "exactly 31 days: %s", resp.body)
	})
}
