package billing_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestABilledVersionIsFrozen(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	newEntitlement(t, "seats", 0)
	newEntitlement(t, "tokens", 0)
	grant(t, s.version.Slug, "seats", 10, 0)
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	path := "/api/licenses/" + s.version.Slug

	require.Equal(t, "AssociateEntitlementToLicense.BillingActive", problemCode(t, fiber.StatusConflict, "POST", path+"/entitlements",
		map[string]any{"entitlementSlug": "tokens", "value": map[string]any{"type": "number", "value": 5}}))
	require.Equal(t, "UpdateLicenseEntitlement.BillingActive", problemCode(t, fiber.StatusConflict, "PUT", path+"/entitlements/seats",
		map[string]any{"value": map[string]any{"type": "number", "value": 20}}))
	require.Equal(t, "DeleteLicenseEntitlement.BillingActive", problemCode(t, fiber.StatusConflict, "DELETE", path+"/entitlements/seats", nil))
	require.Equal(t, "CreateLicensePrice.BillingActive", problemCode(t, fiber.StatusConflict, "POST", path+"/prices", flatFee("29000", "ANNUAL")))

	exec(t, `UPDATE instance_billing SET status = 'CANCELED', canceled_at = now() WHERE id = $1`, started.ID)
	grant(t, s.version.Slug, "tokens", 5, 0)
	createPrice(t, s.version.Slug, flatFee("29000", "ANNUAL"))
}

func TestABilledInstanceOrCustomerIsNotDeleted(t *testing.T) {
	t.Run("AnInstance_UntilCanceledAndSettled", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		path := "/api/instances/" + s.instance.Slug

		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "DELETE", path, nil), fiber.StatusConflict)
		require.Equal(t, "DeleteInstance.BillingActive", problem.Code)
		require.Len(t, problem.Errors, 1)
		value := problem.Errors[0].Value.(map[string]any)
		require.Equal(t, "ACTIVE", value["status"])
		require.Len(t, value["unpaidInvoiceIds"], 1)

		exec(t, `UPDATE instance_billing SET status = 'CANCELED', canceled_at = now() WHERE id = $1`, started.ID)
		problem = commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "DELETE", path, nil), fiber.StatusConflict)
		require.Equal(t, "CANCELED", problem.Errors[0].Value.(map[string]any)["status"], "its invoice is still unpaid")

		act(t, started.ActivationInvoice.ID, "mark-paid", map[string]any{}, fiber.StatusOK)
		resp := call(t, "DELETE", path, nil)
		require.Less(t, resp.StatusCode, 300)

		invoice := getInvoice(t, started.ActivationInvoice.ID)
		require.Equal(t, s.instance.Slug, invoice.InstanceSlug, "the invoice outlives its instance")
		var orphaned bool
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
			`SELECT instance_id IS NULL FROM instance_billing WHERE id = $1`, started.ID).Scan(&orphaned))
		require.True(t, orphaned)
	})

	t.Run("ACustomer_WithALiveSubscription", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		var customerSlug string
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
			`SELECT slug FROM customer WHERE id = $1`, s.instance.CustomerID).Scan(&customerSlug))
		require.Equal(t, "DeleteCustomer.BillingActive", problemCode(t, fiber.StatusConflict, "DELETE", "/api/customers/"+customerSlug, nil))
	})
}

func TestAnEntitlementInUseSaysWhatHoldsIt(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "tokens", 0)
	version := newVersion(t, "Pro", "DRAFT")
	grant(t, version.Slug, "tokens", 1000, 50)
	createPrice(t, version.Slug, metered("OVERAGE", "tokens", "1"))

	problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "DELETE", "/api/entitlements/tokens", nil), fiber.StatusConflict)
	require.Equal(t, "DeleteEntitlement.InUseConflict", problem.Code)
	require.Equal(t, map[string]any{"licenseGrants": float64(1), "usageCounters": float64(0), "licensePrices": float64(1)}, problem.Errors[0].Value)
}

func TestBillingCapabilities(t *testing.T) {
	read := func(t *testing.T, resp *http.Response) getbillingcapabilities.BillingCapabilities {
		t.Helper()
		return commonfixture.AssertJSONResponse[getbillingcapabilities.BillingCapabilities](t, resp, fiber.StatusOK)
	}
	on := read(t, call(t, "GET", "/api/billing/capabilities", nil))
	require.True(t, on.Enabled)
	require.Nil(t, on.DisabledReason)
	require.Len(t, on.Providers, 1)
	require.Equal(t, "NOOP", on.Providers[0].Kind)
	require.False(t, on.Features.Stripe)

	off := read(t, callOn(t, disabledServer, "GET", "/api/billing/capabilities", nil))
	require.False(t, off.Enabled)
	require.Equal(t, "DEPLOYMENT_DISABLED", *off.DisabledReason)

	entitlements.set(t, false, false)
	unsold := read(t, call(t, "GET", "/api/billing/capabilities", nil))
	require.Equal(t, "NOT_ENTITLED", *unsold.DisabledReason)
}
