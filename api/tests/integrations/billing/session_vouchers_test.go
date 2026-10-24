package billing_test

import (
	"encoding/json"
	"io"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/validatesessionvoucher"
)

const sessionValidatePath = "/api/public/session/vouchers/validate"

// §14.4, §11.2 rule 6: a customer checks a code through its session. A code
// that would apply gets what it gives, never the code; every other code the
// same answer, whatever the reason.
func TestSessionVoucherValidation(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	annualPrice := createPrice(t, s.version.Slug, flatFee("29000", "ANNUAL"))
	newPublishableKey(t, storefront)
	bound := mintSession(t, testServer, s.instance.CustomerSlug, s.instance.Slug)
	check := func(token string, body map[string]any) (int, string) {
		t.Helper()
		resp := sessionCall(t, testServer, "POST", sessionValidatePath, token, storefront, body)
		raw, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		return resp.StatusCode, string(raw)
	}
	valid := func(body string) validatesessionvoucher.SessionVoucherValidity {
		t.Helper()
		var validity validatesessionvoucher.SessionVoucherValidity
		require.NoError(t, json.Unmarshal([]byte(body), &validity))
		return validity
	}

	welcome := newVoucher(t, percentOff("30", map[string]any{"name": "Welcome", "duration": "REPEATING", "durationInPeriods": 3}))
	publish(t, welcome)
	status, body := check(bound.Token, map[string]any{"code": strings.ToLower(*welcome.Code)})
	require.Equal(t, fiber.StatusOK, status, body)
	three := int32(3)
	require.Equal(t, validatesessionvoucher.SessionVoucherValidity{Valid: true, Voucher: &validatesessionvoucher.SessionVoucher{
		Name: "Welcome", VoucherType: "PRICE", Duration: "REPEATING", DurationInPeriods: &three,
		Discount: &validatesessionvoucher.SessionDiscount{Type: "PERCENTAGE", Value: "30", Currency: nil, AppliesTo: "LICENSE_BASE"},
		Boosts:   nil,
	}}, valid(body))
	require.NotContains(t, body, `"code"`, "never the code")

	reserved := newVoucher(t, percentOff("30", map[string]any{"restrictedCustomerSlug": newCustomer(t, "gamma").Slug}))
	publish(t, reserved)
	draft := newVoucher(t, percentOff("30", nil))
	used := newVoucher(t, percentOff("10", nil))
	publish(t, used)
	redeem(t, s.instance.Slug, *used.Code)
	annualOnly := newVoucher(t, percentOff("20", map[string]any{"redemptionRules": map[string]any{"annualOnly": true}}))
	publish(t, annualOnly)
	dollars := newVoucher(t, map[string]any{
		"voucherType": "PRICE", "priceDiscountType": "FIXED_AMOUNT", "priceDiscountValue": "500", "currency": "USD", "priceAppliesTo": "BOTH",
	})
	publish(t, dollars)

	status, unknown := check(bound.Token, map[string]any{"code": "NO-SUCH-CODE-42"})
	require.Equal(t, fiber.StatusOK, status)
	require.False(t, valid(unknown).Valid)
	for name, request := range map[string]map[string]any{
		"reserved for another customer":    {"code": *reserved.Code},
		"a draft":                          {"code": *draft.Code},
		"already redeemed by the instance": {"code": *used.Code},
		"annual only, and no annual plan":  {"code": *annualOnly.Code},
		"in dollars, for a plan in euros":  {"code": *dollars.Code, "licensePriceId": s.monthly.ID},
	} {
		status, body := check(bound.Token, request)
		require.Equal(t, fiber.StatusOK, status, name)
		require.Equal(t, unknown, body, "%s: the same answer as an unknown code", name)
	}

	// The price the customer is about to check out is the subscription the
	// rules read.
	_, body = check(bound.Token, map[string]any{"code": *annualOnly.Code, "licensePriceId": annualPrice.ID})
	require.True(t, valid(body).Valid, "annual only, on an annual plan")

	// A session bound to no instance runs the customer's checks only.
	unbound := mintSession(t, testServer, s.instance.CustomerSlug, "")
	_, body = check(unbound.Token, map[string]any{"code": *reserved.Code})
	require.Equal(t, unknown, body)
	_, body = check(unbound.Token, map[string]any{"code": *used.Code})
	require.True(t, valid(body).Valid, "which instance would redeem it is not known")

	// 10 checks per 10 minutes per session.
	limited := mintSession(t, testServer, s.instance.CustomerSlug, s.instance.Slug)
	for i := range 10 {
		status, _ := check(limited.Token, map[string]any{"code": "NO-SUCH-CODE-42"})
		require.Equal(t, fiber.StatusOK, status, "check %d", i)
	}
	resp := sessionCall(t, testServer, "POST", sessionValidatePath, limited.Token, storefront, map[string]any{"code": "NO-SUCH-CODE-42"})
	require.Equal(t, "60", resp.Header.Get("Retry-After"))
	require.Equal(t, "ValidateSessionVoucher.RateLimited", sessionProblem(t, resp, fiber.StatusTooManyRequests))
}

const sessionRedeemPath = "/api/public/session/vouchers/redeem"

// §11.6, V32-02: a customer redeems a code from its portal on the session's
// instance while its subscription is live. A dry run writes nothing; the
// redemption is the vendor's, by the principal that minted the session, its
// event marked via customer_session; every refusal of the code is the same.
func TestSessionVoucherRedemption(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	newPublishableKey(t, storefront)
	welcome := newVoucher(t, percentOff("30", map[string]any{"name": "Welcome", "duration": "REPEATING", "durationInPeriods": 3}))
	publish(t, welcome)
	redeemCall := func(token string, body map[string]any) (int, string) {
		t.Helper()
		resp := sessionCall(t, testServer, "POST", sessionRedeemPath, token, storefront, body)
		raw, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		return resp.StatusCode, string(raw)
	}
	code := func(body string) string {
		t.Helper()
		var problem map[string]any
		require.NoError(t, json.Unmarshal([]byte(body), &problem))
		c, _ := problem["code"].(string)
		return c
	}

	unbound := mintSession(t, testServer, s.instance.CustomerSlug, "")
	status, body := redeemCall(unbound.Token, map[string]any{"code": *welcome.Code})
	require.Equal(t, fiber.StatusUnprocessableEntity, status, body)
	require.Equal(t, "RedeemSessionVoucher.InstanceRequired", code(body))

	bound := mintSession(t, testServer, s.instance.CustomerSlug, s.instance.Slug)
	status, body = redeemCall(bound.Token, map[string]any{"code": *welcome.Code})
	require.Equal(t, fiber.StatusConflict, status, body)
	require.Equal(t, "RedeemSessionVoucher.NoLiveSubscription", code(body), "a checkout starts one")

	subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	status, body = redeemCall(bound.Token, map[string]any{"code": *welcome.Code, "dryRun": true})
	require.Equal(t, fiber.StatusOK, status, body)
	require.Empty(t, outboxPayloads(t, "INSTANCE_VOUCHER_REDEEMED"), "a dry run writes nothing")

	status, body = redeemCall(bound.Token, map[string]any{"code": strings.ToLower(*welcome.Code)})
	require.Equal(t, fiber.StatusCreated, status, body)
	var redeemed map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &redeemed))
	require.Equal(t, "Welcome", redeemed["name"])
	require.Equal(t, "next", redeemed["appliesFromInvoice"], "never the invoice already issued")
	require.EqualValues(t, 3, redeemed["applicationsMax"])
	require.NotContains(t, body, *welcome.Code, "never the code")
	events := outboxPayloads(t, "INSTANCE_VOUCHER_REDEEMED")
	require.Len(t, events, 1)
	require.Equal(t, "customer_session", events[0]["via"])
	require.Equal(t, bound.ID.String(), events[0]["customerSessionId"])
	require.Len(t, portalOf(t, bound.Token).Vouchers, 1, "the portal lists the active redemption")

	// The same answer whatever the reason (§11.2 rule 6).
	draft := newVoucher(t, percentOff("10", nil))
	_, unknown := redeemCall(bound.Token, map[string]any{"code": "NO-SUCH-CODE-42"})
	require.Equal(t, "RedeemSessionVoucher.VoucherInvalid", code(unknown))
	for name, refused := range map[string]string{"already redeemed": *welcome.Code, "a draft": *draft.Code} {
		status, body := redeemCall(bound.Token, map[string]any{"code": refused})
		require.Equal(t, fiber.StatusUnprocessableEntity, status, name)
		require.Equal(t, unknown, body, "%s: the same answer as an unknown code", name)
	}
}
