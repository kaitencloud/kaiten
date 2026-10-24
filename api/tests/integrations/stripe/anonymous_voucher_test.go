package stripe_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	tier2 "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func publishedVoucher(t *testing.T, body map[string]any) catalogue.Voucher {
	t.Helper()
	if _, ok := body["duration"]; !ok {
		body["duration"] = "ONE_TIME"
	}
	voucher := commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers", body), fiber.StatusCreated)
	commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers/"+voucher.ID.String()+"/publish", nil), fiber.StatusOK)
	return voucher
}

// TestAnonymousCheckoutAppliesAVoucher: a visitor's code is checked against
// the selection, with no customer and no instance, at the start and again at
// the confirm; its discount counts in dueToday, and the payment records its
// redemption on the instance the completion created (§11.4, §14.8 rule 5,
// E-6).
func TestAnonymousCheckoutAppliesAVoucher(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	start := func(code string) *tier2.CheckoutSessionStart {
		t.Helper()
		resp := anonymousCall(t, "POST", "/api/public/checkout-sessions", map[string]any{
			"turnstileToken": "token", "priceId": s.monthly.ID, "email": "founder@startup.test", "returnUrl": returnURL, "voucherCode": code,
		}, map[string]string{"X-Kaiten-Publishable-Key": s.key})
		if resp.StatusCode != fiber.StatusCreated {
			problem := commonfixture.AssertJSONResponse[map[string]any](t, resp, fiber.StatusUnprocessableEntity)
			require.Equal(t, "CreateCheckoutSession.VoucherInvalid", problem["code"], code)
			return nil
		}
		opened := commonfixture.AssertJSONResponse[tier2.CheckoutSessionStart](t, resp, fiber.StatusCreated)
		return &opened
	}
	percent := func(code string, extra map[string]any) map[string]any {
		body := map[string]any{
			"name": code, "code": code, "voucherType": "PRICE", "priceDiscountType": "PERCENTAGE",
			"priceDiscountValue": "30", "priceAppliesTo": "LICENSE_BASE", "maxRedemptions": 10,
		}
		for k, v := range extra {
			body[k] = v
		}
		return body
	}

	// Refused, opaquely: restricted to a customer (a visitor is none yet),
	// for another licence, a boost that would wait for the payment, unknown.
	customer := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/customers",
		map[string]any{"name": "Acme", "billingEmail": "billing@acme.test"}), fiber.StatusCreated)
	publishedVoucher(t, percent("RESERVED-ACME-1", map[string]any{"restrictedCustomerSlug": customer["slug"]}))
	publishedVoucher(t, percent("STARTER-ONLY-1", map[string]any{"applicableLicenseIds": []string{s.starter.ID.String()}}))
	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/entitlements", map[string]any{
		"name": "Seats", "slug": "seats", "description": "d", "type": "NUMBER", "aggregationMethod": "SUM",
	}), fiber.StatusCreated)
	publishedVoucher(t, map[string]any{
		"name": "Boost", "code": "BOOST-SEATS-1", "voucherType": "ENTITLEMENT_BOOST", "maxRedemptions": 10,
		"grants": []map[string]any{{"entitlementSlug": "seats", "modifierType": "ADD", "modifierValue": "5"}},
	})
	for _, code := range []string{"RESERVED-ACME-1", "STARTER-ONLY-1", "BOOST-SEATS-1", "NO-SUCH-CODE"} {
		require.Nil(t, start(code))
	}

	launch := publishedVoucher(t, percent("LAUNCH-30-OFF", nil))
	opened := start("LAUNCH-30-OFF")
	require.NotNil(t, opened)
	require.EqualValues(t, 870, opened.DueToday.DiscountTotal, "30 % of 29.00 EUR")
	require.EqualValues(t, 2030, opened.DueToday.Total)

	first := confirmAnonymous(t, *opened)
	pageID := setupSessionID(t, first)
	require.Equal(t, opened.DueToday, first.Session.DueToday)
	fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "4242", 12, 2030)
	done := confirmAnonymous(t, *opened)
	require.Equal(t, tier2.ConfirmCompleted, done.Status)
	require.NotNil(t, done.Session.ActivationInvoice)
	require.EqualValues(t, 2030, done.Session.ActivationInvoice.Total, "charged what the start showed")

	// The payment recorded the redemption, its one application counted.
	redemptions := commonfixture.AssertJSONResponse[[]catalogue.Redemption](t,
		call(t, "GET", "/api/instances/"+*done.Session.InstanceSlug+"/vouchers", nil), fiber.StatusOK)
	require.Len(t, redemptions, 1)
	require.Equal(t, launch.ID, redemptions[0].VoucherID)
	require.EqualValues(t, 1, redemptions[0].ApplicationsCount)
	require.Equal(t, "EXPIRED", redemptions[0].Status, "ONE_TIME: spent by the ACTIVATION")
}

// TestAnonymousCheckoutRechecksTheVoucher: a voucher that cannot be redeemed
// any more by the confirm refuses it, before any setup.
func TestAnonymousCheckoutRechecksTheVoucher(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	voucher := publishedVoucher(t, map[string]any{
		"name": "Launch", "code": "LAUNCH-ONCE-1", "voucherType": "PRICE",
		"priceDiscountType": "PERCENTAGE", "priceDiscountValue": "10", "priceAppliesTo": "LICENSE_BASE", "maxRedemptions": 10,
	})
	opened := commonfixture.AssertJSONResponse[tier2.CheckoutSessionStart](t, anonymousCall(t, "POST", "/api/public/checkout-sessions", map[string]any{
		"turnstileToken": "token", "priceId": s.monthly.ID, "email": "founder@startup.test", "returnUrl": returnURL, "voucherCode": "LAUNCH-ONCE-1",
	}, map[string]string{"X-Kaiten-Publishable-Key": s.key}), fiber.StatusCreated)
	commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers/"+voucher.ID.String()+"/archive", nil), fiber.StatusOK)

	refused := commonfixture.AssertJSONResponse[map[string]any](t, anonymousCall(t, "POST",
		"/api/public/checkout-sessions/"+opened.SessionID.String()+"/confirm", nil,
		map[string]string{"Authorization": "Bearer " + *opened.Token}), fiber.StatusUnprocessableEntity)
	require.Equal(t, "ConfirmCheckoutSession.VoucherInvalid", refused["code"])
	require.Empty(t, fake.CallsOf(stripefake.OpCreateCheckoutSession), "no card asked for in vain")
}
