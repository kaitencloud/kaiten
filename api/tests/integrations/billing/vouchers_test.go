package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/validatevoucher"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func newVoucher(t *testing.T, payload map[string]any) catalogue.Voucher {
	t.Helper()
	if _, ok := payload["name"]; !ok {
		payload["name"] = "Launch"
	}
	if _, ok := payload["duration"]; !ok {
		payload["duration"] = "FOREVER"
	}
	return commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers", payload), fiber.StatusCreated)
}

func percentOff(percent string, extra map[string]any) map[string]any {
	payload := map[string]any{"voucherType": "PRICE", "priceDiscountType": "PERCENTAGE", "priceDiscountValue": percent, "priceAppliesTo": "LICENSE_BASE"}
	for k, v := range extra {
		payload[k] = v
	}
	return payload
}

func publish(t *testing.T, voucher catalogue.Voucher) {
	t.Helper()
	commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers/"+voucher.ID.String()+"/publish", nil), fiber.StatusOK)
}

func redeem(t *testing.T, instanceSlug, code string) catalogue.Redemption {
	t.Helper()
	return commonfixture.AssertJSONResponse[catalogue.Redemption](t,
		call(t, "POST", "/api/instances/"+instanceSlug+"/vouchers/redeem", map[string]any{"code": code}), fiber.StatusCreated)
}

func TestVoucherCatalogue(t *testing.T) {
	t.Run("Create_Lookup_PublishAndEdit", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		generated := newVoucher(t, percentOff("30", nil))
		require.NotNil(t, generated.Code)
		require.Len(t, *generated.Code, 16)
		require.Equal(t, catalogue.StatusDraft, generated.Status)
		require.Equal(t, (*generated.Code)[12:], generated.CodeHint)
		created := outboxPayloads(t, "VOUCHER_CREATED")
		require.Len(t, created, 1)
		require.NotContains(t, created[0], "code", "an event never carries the code")

		custom := newVoucher(t, percentOff("10", map[string]any{"code": "Summer-2026-Launch"}))
		require.Equal(t, "CreateVoucher.CodeConflict", problemCode(t, fiber.StatusConflict, "POST", "/api/vouchers",
			percentOff("10", map[string]any{"name": "x", "duration": "FOREVER", "code": "SUMMER2026LAUNCH"})), "compared without case or separators")
		found := commonfixture.AssertJSONResponse[catalogue.Voucher](t,
			call(t, "POST", "/api/vouchers/lookup", map[string]any{"code": "summer 2026 launch"}), fiber.StatusOK)
		require.Equal(t, custom.ID, found.ID)
		require.Equal(t, "LookupVoucher.NotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/vouchers/lookup", map[string]any{"code": "nope-nope"}))

		for code, payload := range map[string]map[string]any{
			"CreateVoucher.WeakCodeUnbounded":      percentOff("10", map[string]any{"name": "x", "duration": "FOREVER", "code": "SHORT123"}),
			"CreateVoucher.InvalidCode":            percentOff("10", map[string]any{"name": "x", "duration": "FOREVER", "code": "bad code!"}),
			"CreateVoucher.InvalidDiscount":        percentOff("120", map[string]any{"name": "x", "duration": "FOREVER"}),
			"CreateVoucher.InvalidDuration":        percentOff("10", map[string]any{"name": "x", "duration": "REPEATING"}),
			"CreateVoucher.SelectedPricesRequired": percentOff("10", map[string]any{"name": "x", "duration": "FOREVER", "priceAppliesTo": "SELECTED_PRICES"}),
			"CreateVoucher.CurrencyRequired": {
				"name": "x", "duration": "FOREVER", "voucherType": "PRICE", "priceDiscountType": "FIXED_AMOUNT",
				"priceDiscountValue": "500", "priceAppliesTo": "BOTH",
			},
			"CreateVoucher.GrantsRequired": {"name": "x", "duration": "FOREVER", "voucherType": "ENTITLEMENT_BOOST"},
		} {
			require.Equal(t, code, problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/vouchers", payload))
		}
		// PR21-05: applicability ids restrict the voucher, they address nothing.
		require.Equal(t, "CreateVoucher.InvalidApplicability", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/vouchers",
			percentOff("10", map[string]any{"name": "x", "duration": "FOREVER", "applicableLicenseIds": []string{"00000000-0000-4000-8000-000000000000"}})))
		require.Equal(t, "CreateVoucher.InvalidRedemptionRules", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/vouchers",
			percentOff("10", map[string]any{"name": "x", "duration": "FOREVER",
				"redemptionRules": map[string]any{"minimumSubscriptionAmount": map[string]any{"currency": "eur", "unitAmountDecimal": "100"}}})))
		// C-10: the floor counts the normalized code, 11 characters here.
		require.Equal(t, "CreateVoucher.WeakCodeUnbounded", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/vouchers",
			percentOff("10", map[string]any{"name": "x", "duration": "FOREVER", "code": "SUM-MER-2027"})))

		publish(t, custom)
		require.Equal(t, "PublishVoucher.NotADraft", problemCode(t, fiber.StatusConflict, "POST", "/api/vouchers/"+custom.ID.String()+"/publish", nil))
		renamed := commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "PUT", "/api/vouchers/"+custom.ID.String(),
			percentOff("10", map[string]any{"name": "Summer", "duration": "FOREVER", "maxRedemptions": 50})), fiber.StatusOK)
		require.Equal(t, "Summer", renamed.Name)
		require.Equal(t, "UpdateVoucher.NotEditable", problemCode(t, fiber.StatusConflict, "PUT", "/api/vouchers/"+custom.ID.String(),
			percentOff("20", map[string]any{"name": "Summer", "duration": "FOREVER"})), "an active voucher's discount is fixed")

		active := commonfixture.AssertJSONResponse[pagination.Page[catalogue.Voucher]](t, call(t, "GET", "/api/vouchers?status=ACTIVE", nil), fiber.StatusOK)
		require.Len(t, active.Items, 1)
		archived := commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers/"+custom.ID.String()+"/archive", nil), fiber.StatusOK)
		require.Equal(t, catalogue.StatusArchived, archived.Status)
		require.Equal(t, "ArchiveVoucher.AlreadyArchived", problemCode(t, fiber.StatusConflict, "POST", "/api/vouchers/"+custom.ID.String()+"/archive", nil))
	})
}

func TestRedemptions(t *testing.T) {
	t.Run("Checks_RedeemAndRevoke", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		other := newInstance(t, "Other", newCustomer(t, "beta").ID, s.version.ID)
		voucher := newVoucher(t, percentOff("30", map[string]any{"maxRedemptions": 1}))
		code := *voucher.Code
		path := "/api/instances/" + s.instance.Slug + "/vouchers/redeem"

		require.Equal(t, "RedeemVoucher.NotActive", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path, map[string]any{"code": code}))
		require.Equal(t, "RedeemVoucher.NotFound", problemCode(t, fiber.StatusNotFound, "POST", path, map[string]any{"code": "UNKNOWN-CODE-1"}))
		publish(t, voucher)
		validity := commonfixture.AssertJSONResponse[validatevoucher.Validity](t, call(t, "POST", "/api/vouchers/validate",
			map[string]any{"code": code, "instanceSlug": s.instance.Slug}), fiber.StatusOK)
		require.True(t, validity.Valid)
		require.Nil(t, validity.Voucher.Code)

		redemption := redeem(t, s.instance.Slug, code)
		require.Equal(t, "ACTIVE", redemption.Status)
		require.Nil(t, redemption.ApplicationsMax, "FOREVER: no limit")
		require.Len(t, outboxPayloads(t, "VOUCHER_EXHAUSTED"), 1, "the last unit went")
		require.Equal(t, "RedeemVoucher.Exhausted", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/instances/"+other.Slug+"/vouchers/redeem", map[string]any{"code": code}))
		validity = commonfixture.AssertJSONResponse[validatevoucher.Validity](t, call(t, "POST", "/api/vouchers/validate",
			map[string]any{"code": code}), fiber.StatusOK)
		require.False(t, validity.Valid)
		require.Equal(t, catalogue.ReasonExhausted, *validity.Reason)

		listed := commonfixture.AssertJSONResponse[[]catalogue.Redemption](t, call(t, "GET", "/api/instances/"+s.instance.Slug+"/vouchers", nil), fiber.StatusOK)
		require.Len(t, listed, 1)
		revokePath := "/api/instances/" + s.instance.Slug + "/vouchers/" + redemption.ID.String() + "/revoke"
		require.Equal(t, "RevokeInstanceVoucher.ReasonRequired", problemCode(t, fiber.StatusUnprocessableEntity, "POST", revokePath, map[string]any{"reason": " "}))
		revoked := commonfixture.AssertJSONResponse[catalogue.Redemption](t, call(t, "POST", revokePath, map[string]any{"reason": "by mistake"}), fiber.StatusOK)
		require.Equal(t, "REVOKED", revoked.Status)
		require.Equal(t, "RevokeInstanceVoucher.NotActive", problemCode(t, fiber.StatusConflict, "POST", revokePath, map[string]any{"reason": "again"}))
	})

	t.Run("Eligibility", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		reserved := newVoucher(t, percentOff("30", map[string]any{"restrictedCustomerSlug": newCustomer(t, "gamma").Slug}))
		publish(t, reserved)
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "POST", "/api/instances/"+s.instance.Slug+"/vouchers/redeem",
			map[string]any{"code": *reserved.Code}), fiber.StatusUnprocessableEntity)
		require.Equal(t, "RedeemVoucher.NotEligible", problem.Code)
		require.Equal(t, map[string]any{"rule": "RESTRICTED_CUSTOMER"}, problem.Errors[0].Value)

		annual := newVoucher(t, percentOff("30", map[string]any{"redemptionRules": map[string]any{"annualOnly": true}}))
		publish(t, annual)
		validity := commonfixture.AssertJSONResponse[validatevoucher.Validity](t, call(t, "POST", "/api/vouchers/validate",
			map[string]any{"code": *annual.Code, "instanceSlug": s.instance.Slug}), fiber.StatusOK)
		require.Equal(t, catalogue.ReasonNotEligible, *validity.Reason)
		require.Equal(t, catalogue.RuleAnnualOnly, *validity.Rule)
		yearly := createPrice(t, s.version.Slug, flatFee("29000", "ANNUAL"))
		validity = commonfixture.AssertJSONResponse[validatevoucher.Validity](t, call(t, "POST", "/api/vouchers/validate",
			map[string]any{"code": *annual.Code, "instanceSlug": s.instance.Slug, "licensePriceId": yearly.ID}), fiber.StatusOK)
		require.True(t, validity.Valid, "the price the subscription would start on is what the rules read")
		require.Equal(t, "ValidateVoucher.PriceNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/vouchers/validate",
			map[string]any{"code": *annual.Code, "licensePriceId": "00000000-0000-4000-8000-000000000000"}))

		dollars := newVoucher(t, map[string]any{
			"voucherType": "PRICE", "priceDiscountType": "FIXED_AMOUNT", "priceDiscountValue": "500",
			"currency": "USD", "priceAppliesTo": "BOTH",
		})
		publish(t, dollars)
		firstTime := newVoucher(t, percentOff("15", map[string]any{"redemptionRules": map[string]any{"firstTimeOnly": true}}))
		publish(t, firstTime)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, "RedeemVoucher.CurrencyMismatch", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/instances/"+s.instance.Slug+"/vouchers/redeem", map[string]any{"code": *dollars.Code}))

		// first_time_only: until the customer has paid an invoice.
		validity = commonfixture.AssertJSONResponse[validatevoucher.Validity](t, call(t, "POST", "/api/vouchers/validate",
			map[string]any{"code": *firstTime.Code, "instanceSlug": s.instance.Slug}), fiber.StatusOK)
		require.True(t, validity.Valid, "an issued invoice is not a paid one")
		commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST",
			"/api/invoices/"+started.ActivationInvoice.ID.String()+"/mark-paid", map[string]any{}), fiber.StatusOK)
		validity = commonfixture.AssertJSONResponse[validatevoucher.Validity](t, call(t, "POST", "/api/vouchers/validate",
			map[string]any{"code": *firstTime.Code, "instanceSlug": s.instance.Slug}), fiber.StatusOK)
		require.Equal(t, catalogue.ReasonNotEligible, *validity.Reason)
		require.Equal(t, catalogue.RuleFirstTimeOnly, *validity.Rule)
	})
}

func TestBoosts(t *testing.T) {
	t.Run("ABoost_MovesTheEffectiveValue_UntilRevoked", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newEntitlement(t, "seats", 0)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		grant(t, s.version.Slug, "seats", 10, 0)
		boost := newVoucher(t, map[string]any{
			"voucherType": "ENTITLEMENT_BOOST", "duration": "REPEATING", "durationInPeriods": 2,
			"grants": []map[string]any{{"entitlementSlug": "seats", "modifierType": "MULTIPLY", "modifierValue": "3"}},
		})
		publish(t, boost)
		redemption := redeem(t, s.instance.Slug, *boost.Code)
		require.NotNil(t, redemption.EffectiveExpiresAt, "two calendar months without a subscription")
		require.True(t, redemption.EffectiveExpiresAt.Equal(rating.AddMonthsClamped(redemption.RedeemedAt, 2)))

		value, _, ok := effective(t, s.instance.ID, "seats")
		require.True(t, ok)
		require.EqualValues(t, 30, value, "10 × 3")
		commonfixture.AssertJSONResponse[catalogue.Redemption](t, call(t, "POST",
			"/api/instances/"+s.instance.Slug+"/vouchers/"+redemption.ID.String()+"/revoke", map[string]any{"reason": "ended"}), fiber.StatusOK)
		value, _, _ = effective(t, s.instance.ID, "seats")
		require.EqualValues(t, 10, value)

		nothing := newVoucher(t, map[string]any{
			"voucherType": "ENTITLEMENT_BOOST",
			"grants":      []map[string]any{{"entitlementSlug": newEntitlementSlug(t, "calls"), "modifierType": "UNLIMITED"}},
		})
		publish(t, nothing)
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "POST", "/api/instances/"+s.instance.Slug+"/vouchers/redeem",
			map[string]any{"code": *nothing.Code}), fiber.StatusUnprocessableEntity)
		require.Equal(t, map[string]any{"rule": "NOTHING_TO_BOOST"}, problem.Errors[0].Value)
	})
}

func newEntitlementSlug(t *testing.T, slug string) string {
	t.Helper()
	newEntitlement(t, slug, 0)
	return slug
}

func TestDiscountLines(t *testing.T) {
	t.Run("APercentage_DiscountsTwoRenewals_ThenExpires", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		voucher := newVoucher(t, percentOff("30", map[string]any{"duration": "REPEATING", "durationInPeriods": 2}))
		publish(t, voucher)
		redemption := redeem(t, s.instance.Slug, *voucher.Code)
		require.EqualValues(t, 2, *redemption.ApplicationsMax)
		// A redemption applies to the invoices of boundaries after it: move it
		// before the periods the loop moves back.
		exec(t, `UPDATE instance_voucher SET redeemed_at = redeemed_at - interval '4 months',
		           effective_starts_at = effective_starts_at - interval '4 months' WHERE id = $1`, redemption.ID)

		backdate(t, started.ID, 3)
		report := closePeriods(t, map[string]any{})
		require.Len(t, report.Invoices, 3, "three renewals caught up")
		for i, closed := range report.Invoices {
			renewal := getInvoice(t, closed.ID)
			if i == 2 {
				require.Len(t, renewal.Lines, 1, "the redemption is spent")
				require.EqualValues(t, 2900, renewal.Total)
				continue
			}
			require.Len(t, renewal.Lines, 2)
			line := renewal.Lines[1]
			require.Equal(t, rating.LineDiscount, line.Type)
			require.EqualValues(t, -870, line.Amount, "30 % of 29.00 EUR")
			require.Equal(t, []int{1}, line.Discount.TargetSeqs)
			require.EqualValues(t, i+1, line.Discount.Application)
			require.EqualValues(t, 870, renewal.DiscountTotal)
			require.EqualValues(t, 2030, renewal.Total)
		}
		spent := commonfixture.AssertJSONResponse[[]catalogue.Redemption](t, call(t, "GET", "/api/instances/"+s.instance.Slug+"/vouchers", nil), fiber.StatusOK)
		require.Equal(t, "EXPIRED", spent[0].Status)
		require.EqualValues(t, 2, spent[0].ApplicationsCount)
		require.Len(t, outboxPayloads(t, "INSTANCE_VOUCHER_EXPIRED"), 1)
	})

	t.Run("Discounts_StackAndFloorAtZero_OnTheActivation", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		half := newVoucher(t, percentOff("50", map[string]any{"name": "Half"}))
		publish(t, half)
		fixed := newVoucher(t, map[string]any{
			"name": "Welcome", "voucherType": "PRICE", "priceDiscountType": "FIXED_AMOUNT",
			"priceDiscountValue": "5000", "currency": "EUR", "priceAppliesTo": "BOTH",
		})
		publish(t, fixed)
		redeem(t, s.instance.Slug, *half.Code)
		redeem(t, s.instance.Slug, *fixed.Code)

		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.NotNil(t, started.ActivationInvoice)
		activation := getInvoice(t, started.ActivationInvoice.ID)
		require.Len(t, activation.Lines, 3)
		require.EqualValues(t, -1450, activation.Lines[1].Amount, "50 % first")
		require.Equal(t, "2900", activation.Lines[1].Discount.Base)
		require.EqualValues(t, -1450, activation.Lines[2].Amount, "then the fixed amount, on what is left")
		require.Equal(t, "1450", activation.Lines[2].Discount.Base)
		require.EqualValues(t, 0, activation.Total)
		require.Equal(t, "PAID", activation.Status, "nothing is owed")
	})
}

// §13.12: GET /vouchers is a Page<Voucher> (C-1 of the console team's note),
// as /addons, /vouchers/{id}/redemptions and /publishable-keys are.
func TestVoucherListIsPaged(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	created := map[string]bool{}
	for _, name := range []string{"One", "Two", "Three"} {
		created[newVoucher(t, percentOff("10", map[string]any{"name": name})).ID.String()] = true
	}

	first := commonfixture.AssertJSONResponse[pagination.Page[catalogue.Voucher]](t, call(t, "GET", "/api/vouchers?limit=2", nil), fiber.StatusOK)
	require.Len(t, first.Items, 2)
	require.True(t, first.HasMore)
	require.NotNil(t, first.NextCursor)
	second := commonfixture.AssertJSONResponse[pagination.Page[catalogue.Voucher]](t,
		call(t, "GET", "/api/vouchers?limit=2&cursor="+*first.NextCursor, nil), fiber.StatusOK)
	require.Len(t, second.Items, 1)
	require.False(t, second.HasMore)
	require.Nil(t, second.NextCursor)
	seen := map[string]bool{}
	for _, v := range append(first.Items, second.Items...) {
		seen[v.ID.String()] = true
	}
	require.Equal(t, created, seen, "every voucher once, newest first")
	require.True(t, !first.Items[0].CreatedAt.Before(first.Items[1].CreatedAt))

	require.Equal(t, "Vouchers.InvalidCursor", problemCode(t, fiber.StatusBadRequest, "GET", "/api/vouchers?cursor=nope", nil))
	require.Equal(t, "Addons.InvalidCursor", problemCode(t, fiber.StatusBadRequest, "GET", "/api/addons?cursor=nope", nil))
	require.Equal(t, "PublishableKeys.InvalidCursor", problemCode(t, fiber.StatusBadRequest, "GET", "/api/publishable-keys?cursor=nope", nil))
}

// §11.1 (PR21-01 of the console team's note): an ACTIVE voucher takes a new
// name, description, expiresAt and maxRedemptions only. A boost's value and a
// minimum subscription amount were let through, the first then dropped, the
// second written.
func TestAnActiveVouchersTermsAreFixed(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	boostBody := func(value string) map[string]any {
		return map[string]any{
			"name": "Launch", "voucherType": "ENTITLEMENT_BOOST", "duration": "FOREVER",
			"grants": []map[string]any{{"entitlementSlug": "seats", "modifierType": "MULTIPLY", "modifierValue": value}},
		}
	}
	boost := newVoucher(t, boostBody("3"))
	publish(t, boost)
	require.Equal(t, "UpdateVoucher.NotEditable", problemCode(t, fiber.StatusConflict, "PUT", "/api/vouchers/"+boost.ID.String(), boostBody("4")))
	renamed := boostBody("3.0")
	renamed["name"] = "Launch week"
	updated := commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "PUT", "/api/vouchers/"+boost.ID.String(), renamed), fiber.StatusOK)
	require.Equal(t, "Launch week", updated.Name, "the same value, written otherwise, is no change")

	minimum := func(amount string) map[string]any {
		return percentOff("10", map[string]any{"name": "Floor", "duration": "FOREVER",
			"redemptionRules": map[string]any{"minimumSubscriptionAmount": map[string]any{"currency": "EUR", "unitAmountDecimal": amount}}})
	}
	price := newVoucher(t, minimum("2900"))
	publish(t, price)
	require.Equal(t, "UpdateVoucher.NotEditable", problemCode(t, fiber.StatusConflict, "PUT", "/api/vouchers/"+price.ID.String(), minimum("100")))
	stored := commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "GET", "/api/vouchers/"+price.ID.String(), nil), fiber.StatusOK)
	require.Equal(t, "2900", stored.RedemptionRules.MinimumSubscriptionAmount.UnitAmountDecimal)
}
