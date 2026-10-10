package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func problemCode(t *testing.T, status int, method, path string, payload any) string {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, method, path, payload), status).Code
}

func readSettings(t *testing.T) settings.BillingSettings {
	t.Helper()
	return commonfixture.AssertJSONResponse[settings.BillingSettings](t, call(t, "GET", "/api/billing/settings", nil), fiber.StatusOK)
}

func TestBillingSettings(t *testing.T) {
	t.Run("WithoutARow_TheDefaultsApply", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		require.Equal(t, settings.BillingSettings{
			DefaultCollectionMethod: "SEND_INVOICE", DefaultDaysUntilDue: 30, HandoffStripeInvoices: false,
		}, readSettings(t))
	})

	t.Run("APut_ReplacesThem", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		next := map[string]any{"defaultCollectionMethod": "SEND_INVOICE", "defaultDaysUntilDue": 14, "handoffStripeInvoices": true}
		updated := commonfixture.AssertJSONResponse[settings.BillingSettings](t, call(t, "PUT", "/api/billing/settings", next), fiber.StatusOK)
		require.EqualValues(t, 14, updated.DefaultDaysUntilDue)
		require.Equal(t, updated, readSettings(t))

		next["defaultDaysUntilDue"] = 0
		commonfixture.AssertJSONResponse[settings.BillingSettings](t, call(t, "PUT", "/api/billing/settings", next), fiber.StatusOK)
		require.EqualValues(t, 0, readSettings(t).DefaultDaysUntilDue)
	})

	t.Run("BadTerms_AreRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, days := range []int{-1, 366} {
			require.Equal(t, "UpdateBillingSettings.InvalidDaysUntilDue", problemCode(t, fiber.StatusUnprocessableEntity, "PUT", "/api/billing/settings",
				map[string]any{"defaultCollectionMethod": "SEND_INVOICE", "defaultDaysUntilDue": days, "handoffStripeInvoices": false}))
		}
	})

	// F-9 of the console team's note: CHARGE_AUTOMATICALLY is a default like
	// the other (§12.5), and a NOOP subscription still sends its invoices.
	t.Run("ChargeAutomatically_IsADefault_ThatNoopIgnores", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		commonfixture.AssertJSONResponse[settings.BillingSettings](t, call(t, "PUT", "/api/billing/settings",
			map[string]any{"defaultCollectionMethod": "CHARGE_AUTOMATICALLY", "defaultDaysUntilDue": 30, "handoffStripeInvoices": false}), fiber.StatusOK)
		require.Equal(t, "CHARGE_AUTOMATICALLY", readSettings(t).DefaultCollectionMethod)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, "SEND_INVOICE", started.CollectionMethod)
		require.Equal(t, "MANUAL", getInvoice(t, started.ActivationInvoice.ID).Status)
		require.Equal(t, "SEND_INVOICE", getInvoice(t, started.ActivationInvoice.ID).CollectionMethod)
	})

	t.Run("BehindTheBillingGate", func(t *testing.T) {
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
			callOn(t, disabledServer, "GET", "/api/billing/settings", nil), fiber.StatusForbidden)
		require.Equal(t, "Billing.Disabled", problem.Code)
		entitlements.set(t, false, false)
		require.Equal(t, "Billing.NotEntitled", problemCode(t, fiber.StatusForbidden, "GET", "/api/billing/settings", nil))
	})
}
