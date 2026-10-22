package stripe_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	billingstripe "github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessioncheckout"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestCheckoutIncompleteAppliesAtPayment: a checkout with an amount due is
// INCOMPLETE until its ACTIVATION is paid (§9.10, INV-33). Its charge is
// refused first: the instance keeps its version, nothing is attached or
// redeemed, though the ACTIVATION already bills the add-on and the voucher.
// Paid at Stripe and learned by the sync, the payment applies all of it in one
// transaction: the version, the add-on under the id its line named, the
// redemption with its application counted, ACTIVE from the payment.
func TestCheckoutIncompleteAppliesAtPayment(t *testing.T) {
	fresh(t)
	s := newShop(t, nil)
	// The instance starts on a private version the checkout moves it from.
	internal := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": "Internal", "description": "d", "type": "PAID", "isDefault": true,
		"lifecycleState": licenseschema.Published, "pricingType": "CUSTOM",
	}), fiber.StatusCreated)
	instance := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "POST", "/api/instances", map[string]any{
		"name": "Acme staging", "description": "d", "customerId": s.customer.ID, "licenseId": internal.ID,
		"startLicenseDate": time.Now().UTC().Add(-24 * time.Hour), "endLicenseDate": time.Now().UTC().AddDate(1, 0, 0),
		"metadata": map[string]any{},
	}), fiber.StatusCreated)
	session := commonfixture.AssertJSONResponse[createcustomersession.CreatedCustomerSession](t, call(t, "POST", "/api/customer-sessions",
		map[string]any{"customerSlug": s.customer.Slug, "instanceSlug": instance.Slug}), fiber.StatusCreated)
	staging := shop{plan: s.plan, monthly: s.monthly, customer: s.customer, instance: instance, token: session.Token}

	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/addons", map[string]any{
		"name": "Extra seats", "slug": "extra-seats", "description": "per unit", "pricingType": "PAID", "isDefault": true,
	}), fiber.StatusCreated)
	familySlug := planFamilySlug(t, s)
	require.Equal(t, fiber.StatusNoContent, call(t, "PUT", "/api/addons/extra-seats/compatible-license-families/"+familySlug, nil).StatusCode)
	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/addons/extra-seats/prices", map[string]any{
		"billingModel": "FLAT_FEE", "billingPeriod": "MONTHLY", "currency": "EUR", "unitAmountDecimal": "900", "isDefault": true,
	}), fiber.StatusCreated)
	require.Equal(t, fiber.StatusOK, call(t, "PATCH", "/api/addon-families/extra-seats", map[string]any{"isPublic": true}).StatusCode)
	half := priceVoucher(t, map[string]any{
		"name": "HALF", "code": "HALF-PRICE-LAUNCH", "priceDiscountType": "PERCENTAGE", "priceDiscountValue": "50", "priceAppliesTo": "LICENSE_BASE",
	})

	order := map[string]any{
		"licensePriceId": s.monthly.ID, "returnUrl": returnURL,
		"addOns": []map[string]any{{"addonSlug": "extra-seats", "quantity": 2}}, "voucherCode": "HALF-PRICE-LAUNCH",
	}
	setup := checkout(t, staging, order, fiber.StatusOK)
	saveCardOnPage(t, *setup.SetupSessionID, stripefake.CardDeclined)
	done := checkout(t, staging, with(order, "setupSessionId", *setup.SetupSessionID), fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.PaymentFailed, done.Payment.Status)
	require.Equal(t, "INCOMPLETE", done.Subscription.Status)
	require.EqualValues(t, 1450+1800, done.ActivationInvoice.Total, "29.00 halved, and two seats at 9.00")

	billingPath := "/api/instances/" + instance.Slug + "/billing"
	waiting := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
	require.Equal(t, "INCOMPLETE", waiting["status"])
	held := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, internal.ID, held.LicenseID, "the version moves only at payment")
	require.Empty(t, commonfixture.AssertJSONResponse[[]map[string]any](t, call(t, "GET", "/api/instances/"+instance.Slug+"/addons", nil), fiber.StatusOK))
	require.Empty(t, commonfixture.AssertJSONResponse[[]map[string]any](t, call(t, "GET", "/api/instances/"+instance.Slug+"/vouchers", nil), fiber.StatusOK))

	activation := invoice(t, mustUUID(t, done.ActivationInvoice.ID))
	var seatLine, discountLine *rating.InvoiceLine
	for i := range activation.Lines {
		switch activation.Lines[i].Type {
		case rating.LineAddon:
			seatLine = &activation.Lines[i]
		case rating.LineDiscount:
			discountLine = &activation.Lines[i]
		}
	}
	require.NotNil(t, seatLine)
	require.NotNil(t, discountLine)

	fake.Pay(stripefake.DefaultAccount, deref(activation.Provider.ExternalInvoiceID))
	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/billing/sync", nil).StatusCode)
	require.Eventually(t, func() bool {
		sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
		return sub["status"] == "ACTIVE"
	}, 20*time.Second, 100*time.Millisecond, "the payment settles it")

	moved := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, s.plan.ID, moved.LicenseID, "the version bought")
	attached := commonfixture.AssertJSONResponse[[]map[string]any](t, call(t, "GET", "/api/instances/"+instance.Slug+"/addons", nil), fiber.StatusOK)
	require.Len(t, attached, 1)
	require.Equal(t, seatLine.InstanceAddonID.String(), attached[0]["id"], "under the id the ACTIVATION's line named")
	require.EqualValues(t, 2, attached[0]["quantity"])
	redeemed := commonfixture.AssertJSONResponse[[]map[string]any](t, call(t, "GET", "/api/instances/"+instance.Slug+"/vouchers", nil), fiber.StatusOK)
	require.Len(t, redeemed, 1)
	require.Equal(t, discountLine.InstanceVoucherID.String(), redeemed[0]["id"])
	require.Equal(t, half.ID.String(), redeemed[0]["voucherId"])
	require.EqualValues(t, 1, redeemed[0]["applicationsCount"], "the ACTIVATION's discount counts")
}

// planFamilySlug is the slug of the shop's plan's family.
func planFamilySlug(t *testing.T, s shop) string {
	t.Helper()
	families := commonfixture.AssertJSONResponse[pagination.Page[licenseschema.LicenseFamilyView]](t,
		call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
	for _, family := range families.Items {
		if family.ID == s.plan.FamilyID {
			return family.Slug
		}
	}
	t.Fatalf("no family for plan %s", s.plan.Slug)
	return ""
}

// with is order with key set to value.
func with(order map[string]any, key string, value any) map[string]any {
	out := make(map[string]any, len(order)+1)
	for k, v := range order {
		out[k] = v
	}
	out[key] = value
	return out
}

// declinedCheckout is the shop's instance checked out with a card the charge
// refuses: INCOMPLETE, its ACTIVATION PAYMENT_FAILED.
func declinedCheckout(t *testing.T, s shop) createsessioncheckout.SessionCheckout {
	t.Helper()
	order := map[string]any{"licensePriceId": s.monthly.ID, "returnUrl": returnURL}
	setup := checkout(t, s, order, fiber.StatusOK)
	saveCardOnPage(t, *setup.SetupSessionID, stripefake.CardDeclined)
	done := checkout(t, s, with(order, "setupSessionId", *setup.SetupSessionID), fiber.StatusCreated)
	require.Equal(t, "INCOMPLETE", done.Subscription.Status)
	return done
}

// TestIncompleteExpiresUnpaid: billing-lifecycle step (d) ends a checkout
// unpaid at incomplete_expires_at (§9.10 rule 4): its ACTIVATION voided at
// Stripe first, then VOID, the subscription CANCELED INCOMPLETE_EXPIRED, the
// licence left as it was.
func TestIncompleteExpiresUnpaid(t *testing.T) {
	fresh(t)
	s := newShop(t, nil)
	done := declinedCheckout(t, s)
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE instance_billing SET incomplete_expires_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE instance_id = $1`, s.instance.ID)
	require.NoError(t, err)

	jobs := tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval, cfg.Billing.Sync.Interval, cfg.Billing.Push.Interval = -1, -1, -1
			cfg.Billing.Lifecycle.Interval = 100 * time.Millisecond
			cfg.Billing.InitialDelay = 20 * time.Millisecond
		},
		ConnectorEntitlements: entitlements,
		Stripe:                billingstripe.Options{BaseURL: fake.URL(), HTTPClient: fake.Client()},
	})
	t.Cleanup(func() { require.NoError(t, jobs.Close()) })

	billingPath := "/api/instances/" + s.instance.Slug + "/billing"
	require.Eventually(t, func() bool {
		sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
		return sub["status"] == "CANCELED"
	}, 20*time.Second, 100*time.Millisecond, "step (d) ends it")
	sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
	require.Equal(t, "INCOMPLETE_EXPIRED", sub["cancellationReason"])
	voided := invoice(t, mustUUID(t, done.ActivationInvoice.ID))
	require.Equal(t, "VOID", voided.Status)
	require.NotEmpty(t, fake.CallsOf(stripefake.OpVoidInvoice), "voided at Stripe first")
	held := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+s.instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, s.plan.ID, held.LicenseID, "nothing moves")
}

// TestIncompleteRefusalsAndCancel: while INCOMPLETE, what the checkout
// bought is fixed (§9.10 rule 5): reactivate, plan changes and add-on writes
// answer 409 .SubscriptionIncomplete; a cancel, any mode, ends it at once,
// its ACTIVATION voided.
func TestIncompleteRefusalsAndCancel(t *testing.T) {
	fresh(t)
	s := newShop(t, nil)
	done := declinedCheckout(t, s)
	base := "/api/instances/" + s.instance.Slug
	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/addons", map[string]any{
		"name": "Extra seats", "slug": "extra-seats", "description": "per unit", "pricingType": "FREE", "isDefault": true,
	}), fiber.StatusCreated)
	require.Equal(t, fiber.StatusNoContent, call(t, "PUT", "/api/addons/extra-seats/compatible-license-families/"+planFamilySlug(t, s), nil).StatusCode)
	for _, refused := range []struct {
		method, path string
		body         map[string]any
	}{
		{"POST", base + "/addons", map[string]any{"addonSlug": "extra-seats", "quantity": 1}},
		{"POST", base + "/billing/reactivate", map[string]any{}},
		{"PUT", base + "/billing/scheduled-change", map[string]any{"licensePriceId": s.monthly.ID}},
	} {
		problem := commonfixture.AssertJSONResponse[map[string]any](t, call(t, refused.method, refused.path, refused.body), fiber.StatusConflict)
		require.Contains(t, problem["code"], ".SubscriptionIncomplete", refused.path)
	}

	canceled := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", base+"/billing/cancel",
		map[string]any{"mode": "AT_PERIOD_END"}), fiber.StatusOK)
	require.Equal(t, "CANCELED", canceled["status"], "at once, whatever the mode")
	require.Equal(t, "VOID", invoice(t, mustUUID(t, done.ActivationInvoice.ID)).Status)
}

// TestCheckoutWaitsOverAFreePlan: with an amount due, a checkout over a free
// live subscription leaves it live until the ACTIVATION is paid (§9.10 rule
// 6, the v3.2 ruling on V31-68). A refused charge keeps the free plan as it
// was, the checkout in its pending columns; a second checkout is refused.
// Paid, the free subscription is replaced on the same row: ACTIVE on the
// price bought, the version moved.
func TestCheckoutWaitsOverAFreePlan(t *testing.T) {
	fresh(t)
	s := newShop(t, nil)
	starter := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": "Starter", "description": "d", "type": "PAID", "isDefault": true,
		"lifecycleState": licenseschema.Published, "pricingType": "FREE",
	}), fiber.StatusCreated)
	free := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/licenses/"+starter.Slug+"/prices", map[string]any{
		"billingModel": "FLAT_FEE", "billingPeriod": "MONTHLY", "currency": "EUR", "unitAmountDecimal": "0", "isDefault": true,
	}), fiber.StatusCreated)
	instance := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "POST", "/api/instances", map[string]any{
		"name": "Acme starter", "description": "d", "customerId": s.customer.ID, "licenseId": starter.ID,
		"startLicenseDate": time.Now().UTC().Add(-24 * time.Hour), "endLicenseDate": time.Now().UTC().AddDate(1, 0, 0),
		"metadata": map[string]any{},
	}), fiber.StatusCreated)
	billingPath := "/api/instances/" + instance.Slug + "/billing"
	before := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", billingPath,
		map[string]any{"basePriceId": free["id"], "startAt": time.Now().UTC().Add(-time.Hour)}), fiber.StatusCreated)
	session := commonfixture.AssertJSONResponse[createcustomersession.CreatedCustomerSession](t, call(t, "POST", "/api/customer-sessions",
		map[string]any{"customerSlug": s.customer.Slug, "instanceSlug": instance.Slug}), fiber.StatusCreated)
	onStarter := shop{plan: s.plan, monthly: s.monthly, customer: s.customer, instance: instance, token: session.Token}

	order := map[string]any{"licensePriceId": s.monthly.ID, "returnUrl": returnURL}
	setup := checkout(t, onStarter, order, fiber.StatusOK)
	saveCardOnPage(t, *setup.SetupSessionID, stripefake.CardDeclined)
	done := checkout(t, onStarter, with(order, "setupSessionId", *setup.SetupSessionID), fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.PaymentFailed, done.Payment.Status)
	waiting := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
	require.Equal(t, "ACTIVE", waiting["status"], "the free plan goes on")
	require.Equal(t, free["id"], waiting["basePrice"].(map[string]any)["id"])
	held := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, starter.ID, held.LicenseID)
	again := commonfixture.AssertJSONResponse[map[string]any](t, asCustomer(t, onStarter, "POST", checkoutPath, order), fiber.StatusConflict)
	require.Equal(t, "CreateSessionCheckout.AlreadySubscribed", again["code"], "a checkout already waits on it")

	activation := invoice(t, mustUUID(t, done.ActivationInvoice.ID))
	require.Equal(t, "STRIPE", activation.ProviderKind)
	fake.Pay(stripefake.DefaultAccount, deref(activation.Provider.ExternalInvoiceID))
	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/billing/sync", nil).StatusCode)
	require.Eventually(t, func() bool {
		sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
		return sub["providerKind"] == "STRIPE"
	}, 20*time.Second, 100*time.Millisecond, "the payment replaces the free plan")
	after := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
	require.Equal(t, before["id"], after["id"], "the same row")
	require.Equal(t, "ACTIVE", after["status"])
	require.Equal(t, s.monthly.ID.String(), after["basePrice"].(map[string]any)["id"])
	moved := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, s.plan.ID, moved.LicenseID)
}
