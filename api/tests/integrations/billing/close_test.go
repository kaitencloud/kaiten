package billing_test

import (
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/billableusage"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/billablecatalogue"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func closePeriods(t *testing.T, body map[string]any) closing.Report {
	t.Helper()
	return commonfixture.AssertJSONResponse[closing.Report](t, call(t, "POST", "/api/billing/close-periods", body), fiber.StatusOK)
}

func readBilling(t *testing.T, instanceSlug string) subscriptions.InstanceBilling {
	t.Helper()
	return commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
		call(t, "GET", "/api/instances/"+instanceSlug+"/billing", nil), fiber.StatusOK)
}

// meteredSold is a published version priced 29.00 EUR a month in advance
// plus 8.00 EUR per 10k tokens above a 100,000 limit accepting 50 % more,
// and an instance of it.
func meteredSold(t *testing.T) sold {
	t.Helper()
	newEntitlement(t, "tokens", 10000)
	version := newVersion(t, "Pro", licenseschema.Published)
	grant(t, version.Slug, "tokens", 100000, 50)
	monthly := createPrice(t, version.Slug, flatFee("2900", "MONTHLY"))
	createPrice(t, version.Slug, metered("OVERAGE", "tokens", "800"))
	customer := newCustomer(t, "acme")
	return sold{version: version, monthly: monthly, instance: newInstance(t, "Acme prod", customer.ID, version.ID)}
}

func reportTokens(t *testing.T, instanceSlug string, value float64) {
	t.Helper()
	resp := call(t, "POST", "/api/instances/"+instanceSlug+"/entitlements/tokens/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"})
	require.Less(t, resp.StatusCode, 300)
}

// backdate moves a subscription's anchor and periods back by months, as if it
// had been subscribed that long ago and never closed since.
func backdate(t *testing.T, subscriptionID any, months int) {
	t.Helper()
	exec(t, `UPDATE instance_billing
	            SET anchor_at = anchor_at - make_interval(months => $2),
	                started_at = started_at - make_interval(months => $2),
	                current_period_start = current_period_start - make_interval(months => $2),
	                current_period_end = current_period_end - make_interval(months => $2)
	          WHERE id = $1`, subscriptionID, months)
}

func TestClosePeriods(t *testing.T) {
	t.Run("AnEndedPeriod_ClosesIntoARenewal_OfItsUsageAndTheNextBase", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := meteredSold(t)
		// A month ago, give or take two seconds: the period ends just after the
		// usage is reported.
		started := subscribe(t, s.instance.Slug, map[string]any{
			"basePriceId": s.monthly.ID, "startAt": time.Now().UTC().AddDate(0, -1, 0).Add(2 * time.Second),
		})
		reportTokens(t, s.instance.Slug, 60000)
		reportTokens(t, s.instance.Slug, 70500)

		require.Equal(t, 0, closePeriods(t, map[string]any{}).Closed, "the period has not ended yet")
		time.Sleep(time.Until(started.CurrentPeriodEnd.Add(100 * time.Millisecond)))

		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		require.Equal(t, 0, report.Held)
		require.False(t, report.HasMore)
		require.Len(t, report.Invoices, 1)
		require.Equal(t, "RENEWAL", report.Invoices[0].Kind)
		require.True(t, report.Invoices[0].BoundaryAt.Equal(started.CurrentPeriodEnd))

		invoice := readInvoiceRow(t, report.Invoices[0].ID)
		require.Equal(t, invoices.StatusManual, invoice.Status)
		require.Len(t, invoice.Lines, 2)
		overage, base := invoice.Lines[0], invoice.Lines[1]
		require.Equal(t, "OVERAGE", string(overage.Type))
		require.Equal(t, "3.05", overage.Quantity, "130,500 tokens, 30,500 above the limit")
		require.EqualValues(t, 2440, overage.Amount)
		require.True(t, overage.ServiceFrom.Equal(started.AnchorAt))
		require.True(t, overage.ServiceTo.Equal(started.CurrentPeriodEnd))
		require.EqualValues(t, 2, overage.Metering.Ledger.Rows)
		require.Equal(t, "BASE", string(base.Type))
		require.True(t, base.ServiceFrom.Equal(started.CurrentPeriodEnd))
		require.EqualValues(t, 5340, invoice.Total)

		billing := readBilling(t, s.instance.Slug)
		require.True(t, billing.CurrentPeriodStart.Equal(started.CurrentPeriodEnd))
		require.True(t, billing.CurrentPeriodEnd.Equal(started.AnchorAt.AddDate(0, 2, 0)))
		require.Equal(t, 0, closePeriods(t, map[string]any{}).Closed, "the next period has not ended")
	})

	t.Run("ASubscriptionPeriodsBehind_ClosesOnePeriodAtATime_UntilCurrent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		backdate(t, started.ID, 3)

		report := closePeriods(t, map[string]any{})
		require.Equal(t, 3, report.Closed)
		require.False(t, report.HasMore)
		anchor := started.AnchorAt.AddDate(0, -3, 0)
		for i, invoice := range report.Invoices {
			require.Equal(t, "RENEWAL", invoice.Kind)
			require.True(t, invoice.BoundaryAt.Equal(anchor.AddDate(0, i+1, 0)), "boundary %d", i)
		}
		require.True(t, readBilling(t, s.instance.Slug).CurrentPeriodEnd.Equal(started.CurrentPeriodEnd))
	})

	t.Run("ABrokenJournal_HoldsTheInvoice_AndThePeriodStillAdvances", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := meteredSold(t)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		reportTokens(t, s.instance.Slug, 10)
		reportTokens(t, s.instance.Slug, 20)
		exec(t, `UPDATE usage_ledger SET value_before = 999 WHERE instance_id = $1 AND report_seq = 2`, s.instance.ID)
		backdate(t, started.ID, 1)
		exec(t, `UPDATE usage_ledger SET reported_at = reported_at - INTERVAL '1 month' WHERE instance_id = $1`, s.instance.ID)

		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		require.Equal(t, 1, report.Held)
		invoice := readInvoiceRow(t, report.Invoices[0].ID)
		require.Equal(t, invoices.StatusDraft, invoice.Status)
		require.Equal(t, "LEDGER_CHAIN_BREAK", *invoice.HoldReason)
		require.Len(t, invoice.HoldDetail.Pairs, 1)
		require.Equal(t, invoices.HandoffNotRequired, invoice.HandoffStatus)
		require.Nil(t, invoice.IssuedAt)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_HELD"), 1)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_ISSUED"), 1, "only the ACTIVATION was issued")
		require.True(t, readBilling(t, s.instance.Slug).CurrentPeriodStart.Equal(started.CurrentPeriodEnd.AddDate(0, -1, 0)))
	})

	t.Run("ConcurrentCloses_IssueOneInvoicePerBoundary", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		backdate(t, started.ID, 4)

		count := func() (renewals, boundaries int) {
			require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
				`SELECT count(*), count(DISTINCT boundary_at) FROM instance_invoice WHERE instance_billing_id = $1 AND kind = 'RENEWAL'`,
				started.ID).Scan(&renewals, &boundaries))
			return renewals, boundaries
		}

		var wg sync.WaitGroup
		for range 8 {
			wg.Go(func() { closePeriods(t, map[string]any{}) })
		}
		wg.Wait()
		renewals, boundaries := count()
		require.Equal(t, renewals, boundaries, "never two invoices for one boundary")

		// A close never waits for a subscription another one holds: what the
		// racing calls left is closed by the next one.
		closePeriods(t, map[string]any{})
		renewals, boundaries = count()
		require.Equal(t, 4, renewals)
		require.Equal(t, 4, boundaries)
		require.True(t, readBilling(t, s.instance.Slug).CurrentPeriodEnd.Equal(started.CurrentPeriodEnd))
	})

	t.Run("OneInstance_CanBeClosedAlone", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		a := newSold(t, flatFee("2900", "MONTHLY"))
		customer := newCustomer(t, "globex")
		b := newInstance(t, "Globex prod", customer.ID, a.version.ID)
		first := subscribe(t, a.instance.Slug, map[string]any{"basePriceId": a.monthly.ID})
		second := subscribe(t, b.Slug, map[string]any{"basePriceId": a.monthly.ID})
		backdate(t, first.ID, 1)
		backdate(t, second.ID, 1)

		require.Equal(t, "CloseBillingPeriods.InstanceNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/billing/close-periods",
			map[string]any{"instanceSlug": "nope"}))
		report := closePeriods(t, map[string]any{"instanceSlug": b.Slug})
		require.Equal(t, 1, report.Closed)
		require.Equal(t, b.Slug, report.Invoices[0].InstanceSlug)
		require.Equal(t, 1, closePeriods(t, map[string]any{}).Closed, "the other one is still due")
	})

	t.Run("ThePlatform_ClosesAnOrganization_AsSystemKaiten", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		backdate(t, started.ID, 1)

		req := commonfixture.NewJSONRequest(t, "POST",
			"/api/platform/organizations/"+testDb.DefaultData.OrganizationID.String()+"/billing/close-periods", map[string]any{})
		resp, err := platformServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		report := commonfixture.AssertJSONResponse[closing.Report](t, resp, fiber.StatusOK)
		require.Equal(t, 1, report.Closed)

		var writer string
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
			`SELECT u.external_id FROM instance_billing ib JOIN "user" u ON u.id = ib.updated_by_id WHERE ib.id = $1`, started.ID).Scan(&writer))
		require.Equal(t, "system:kaiten", writer)
	})
}

// The period-close job closes due subscriptions on its own.
func TestPeriodCloseJob(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	backdate(t, started.ID, 2)

	unit := uow.NewUnitOfWork(testDb.DbPool)
	closer := closing.New(access.Deps{
		UserProvider: nil, Uof: unit, Gate: gate.New(true, services.AlwaysEntitled{}),
		Catalogue: billablecatalogue.New(unit), Usage: billableusage.New(testDb.DbPool, unit),
	}, 0)
	job := closing.NewJob(testDb.DbPool, closer, sweep.Config{InitialDelay: time.Millisecond, Interval: 50 * time.Millisecond}, 100)
	job.Start(t.Context())
	t.Cleanup(job.Stop)

	require.Eventually(t, func() bool {
		return readBilling(t, s.instance.Slug).CurrentPeriodEnd.Equal(started.CurrentPeriodEnd)
	}, 10*time.Second, 50*time.Millisecond)
	var renewals int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM instance_invoice WHERE instance_billing_id = $1 AND kind = 'RENEWAL'`, started.ID).Scan(&renewals))
	require.Equal(t, 2, renewals)
}

// readInvoiceRow reads an invoice straight from the table, until the invoice
// reads exist.
func readInvoiceRow(t *testing.T, id any) invoices.Invoice {
	t.Helper()
	rows, err := testDb.DbPool.Query(t.Context(), `SELECT * FROM instance_invoice WHERE id = $1`, id)
	require.NoError(t, err)
	row, err := pgxCollectInvoice(rows)
	require.NoError(t, err)
	invoice, err := invoices.FromRow(row)
	require.NoError(t, err)
	return invoice
}
