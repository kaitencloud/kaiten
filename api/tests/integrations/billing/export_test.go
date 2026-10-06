package billing_test

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"io"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoicelinereports"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func body(t *testing.T, path string) (string, string) {
	t.Helper()
	resp := call(t, "GET", path, nil)
	require.Equal(t, fiber.StatusOK, resp.StatusCode)
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.Header.Get("Content-Type"), string(raw)
}

func csvRows(t *testing.T, raw string) [][]string {
	t.Helper()
	rows, err := csv.NewReader(strings.NewReader(raw)).ReadAll()
	require.NoError(t, err)
	return rows
}

func TestExportInvoices(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	acme := newSold(t, flatFee("2900", "MONTHLY"))
	globexCustomer := newCustomer(t, "globex")
	globex := newInstance(t, "Globex prod", globexCustomer.ID, acme.version.ID)
	first := subscribe(t, acme.instance.Slug, map[string]any{"basePriceId": acme.monthly.ID})
	subscribe(t, globex.Slug, map[string]any{"basePriceId": acme.monthly.ID})
	backdate(t, first.ID, 2)
	require.Equal(t, 2, closePeriods(t, map[string]any{}).Closed)

	t.Run("ByLine_IsOneRowPerLine_InMinorUnits", func(t *testing.T) {
		contentType, raw := body(t, "/api/invoices/export")
		require.Contains(t, contentType, "text/csv")
		rows := csvRows(t, raw)
		header := rows[0]
		require.Equal(t, "invoice_id", header[0])
		require.Contains(t, header, "line_amount_minor")
		require.Contains(t, header, "currency_exponent")
		require.Len(t, rows, 1+4, "four invoices of one line each")
		column := func(name string) int {
			for i, h := range header {
				if h == name {
					return i
				}
			}
			t.Fatalf("no column %s", name)
			return -1
		}
		for _, row := range rows[1:] {
			require.Equal(t, "2900", row[column("line_amount_minor")])
			require.Equal(t, "2", row[column("currency_exponent")])
			require.Contains(t, row[column("billing_email")], "@")
		}
		require.Len(t, csvRows(t, func() string { _, r := body(t, "/api/invoices/export?kind=RENEWAL"); return r }()), 1+2)
	})

	t.Run("ByInvoice_IsOneRowPerInvoice", func(t *testing.T) {
		_, raw := body(t, "/api/invoices/export?granularity=invoice")
		rows := csvRows(t, raw)
		require.NotContains(t, rows[0], "line_seq")
		require.Len(t, rows, 1+4)
	})

	t.Run("AsJSON_IsOneInvoicePerLine", func(t *testing.T) {
		contentType, raw := body(t, "/api/invoices/export?format=json")
		require.Equal(t, "application/x-ndjson", contentType)
		scanner := bufio.NewScanner(strings.NewReader(raw))
		n := 0
		for scanner.Scan() {
			var invoice invoices.Invoice
			require.NoError(t, json.Unmarshal(scanner.Bytes(), &invoice))
			require.Len(t, invoice.Lines, 1)
			n++
		}
		require.Equal(t, 4, n)
	})

	t.Run("AnUnknownFormatOrGranularity_IsRefused", func(t *testing.T) {
		require.Equal(t, "ExportInvoices.InvalidFormat", problemCode(t, fiber.StatusUnprocessableEntity, "GET", "/api/invoices/export?format=xml", nil))
		require.Equal(t, "ExportInvoices.InvalidGranularity", problemCode(t, fiber.StatusUnprocessableEntity, "GET", "/api/invoices/export?granularity=day", nil))
	})
}

func TestInvoiceLineReports(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := meteredSold(t)
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	reportTokens(t, s.instance.Slug, 110000)
	reportTokens(t, s.instance.Slug, 20000)
	backdate(t, started.ID, 1)
	exec(t, `UPDATE usage_ledger SET reported_at = reported_at - INTERVAL '1 month' WHERE instance_id = $1`, s.instance.ID)
	report := closePeriods(t, map[string]any{})
	require.Equal(t, 1, report.Closed)
	invoice := getInvoice(t, report.Invoices[0].ID)
	require.Len(t, invoice.Lines, 2)
	overage, base := invoice.Lines[0], invoice.Lines[1]
	path := "/api/invoices/" + invoice.ID.String() + "/lines/"

	t.Run("AMeteredLine_ListsTheReportsItWasMeasuredFrom", func(t *testing.T) {
		page := commonfixture.AssertJSONResponse[listinvoicelinereports.LineReportPage](t,
			call(t, "GET", path+overage.ID.String()+"/reports", nil), fiber.StatusOK)
		require.Len(t, page.Items, int(overage.Metering.Ledger.Rows))
		sum := decimal.Zero
		for _, item := range page.Items {
			sum = sum.Add(decimal.RequireFromString(item.Delta))
		}
		require.Equal(t, "130000", sum.String())
		require.Nil(t, page.NextAfterSeq)

		first := commonfixture.AssertJSONResponse[listinvoicelinereports.LineReportPage](t,
			call(t, "GET", path+overage.ID.String()+"/reports?limit=1", nil), fiber.StatusOK)
		require.Len(t, first.Items, 1)
		require.NotNil(t, first.NextAfterSeq)
	})

	t.Run("AsCSV_ItStreamsThemAll", func(t *testing.T) {
		contentType, raw := body(t, path+overage.ID.String()+"/reports?format=csv")
		require.Contains(t, contentType, "text/csv")
		require.Len(t, csvRows(t, raw), 1+2)
	})

	t.Run("ItAnswersAfterTheInstanceIsGone", func(t *testing.T) {
		exec(t, `UPDATE instance_billing SET instance_id = NULL WHERE id = $1`, started.ID)
		page := commonfixture.AssertJSONResponse[listinvoicelinereports.LineReportPage](t,
			call(t, "GET", path+overage.ID.String()+"/reports", nil), fiber.StatusOK)
		require.Len(t, page.Items, 2)
	})

	t.Run("OnlyAMeteredLineOfThisInvoice", func(t *testing.T) {
		require.Equal(t, "ListInvoiceLineReports.NotMetered", problemCode(t, fiber.StatusUnprocessableEntity, "GET",
			path+base.ID.String()+"/reports", nil))
		require.Equal(t, "ListInvoiceLineReports.LineNotFound", problemCode(t, fiber.StatusNotFound, "GET",
			path+invoice.ID.String()+"/reports", nil))
		require.Equal(t, "ListInvoiceLineReports.InvalidFormat", problemCode(t, fiber.StatusUnprocessableEntity, "GET",
			path+overage.ID.String()+"/reports?format=xml", nil))
	})
}
