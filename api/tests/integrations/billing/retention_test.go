package billing_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// §6.5 rule 3, §8.8, §8.9 rule 2 (A-15 of the console team's note): a read
// for a user that would measure usage from before the organization's usage
// history is refused, naming retentionStart; the close is not.
func TestReadsBeforeTheUsageHistory(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	keeping := tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval = -1
			cfg.UsageLedger.RetentionMonths = 2
		},
		ConnectorEntitlements: entitlements,
	})
	t.Cleanup(func() { _ = keeping.Close() })

	s := meteredSold(t)
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	backdate(t, started.ID, 4)

	refused := func(code, method, path string) {
		t.Helper()
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, callOn(t, keeping, method, path, nil), fiber.StatusUnprocessableEntity)
		require.Equal(t, code, problem.Code)
		require.NotEmpty(t, problem.Errors)
		require.Equal(t, "retentionStart", problem.Errors[0].Location)
		start, err := time.Parse(time.RFC3339Nano, problem.Errors[0].Value.(string))
		require.NoError(t, err)
		require.WithinDuration(t, time.Now().AddDate(0, -2, 0), start, 24*time.Hour)
	}
	refused("GetUpcomingInvoice.OutsideRetention", "GET", "/api/instances/"+s.instance.Slug+"/billing/upcoming-invoice")
	require.Equal(t, fiber.StatusOK, call(t, "GET", "/api/instances/"+s.instance.Slug+"/billing/upcoming-invoice", nil).StatusCode,
		"18 months of history reach it")

	report := closePeriods(t, map[string]any{})
	require.Positive(t, report.Closed, "the close bills whatever the history")
	renewal := report.Invoices[0].ID
	commonfixture.AssertJSONResponse[invoices.Invoice](t,
		call(t, "POST", "/api/invoices/"+renewal.String()+"/void", map[string]any{"reason": "re-issue"}), fiber.StatusOK)
	refused("RecomposeInvoice.OutsideRetention", "POST", "/api/invoices/"+renewal.String()+"/recompose")
	require.Equal(t, fiber.StatusCreated, call(t, "POST", "/api/invoices/"+renewal.String()+"/recompose", nil).StatusCode)
}
