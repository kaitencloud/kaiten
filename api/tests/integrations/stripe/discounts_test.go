package stripe_test

import (
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	billingstripe "github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// CR-001: PRICE vouchers reach Stripe as one-off coupons on the items they
// discount, never as negative items, with or without automatic tax.

func priceVoucher(t *testing.T, payload map[string]any) catalogue.Voucher {
	t.Helper()
	payload["voucherType"], payload["duration"] = "PRICE", "FOREVER"
	voucher := commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers", payload), fiber.StatusCreated)
	commonfixture.AssertJSONResponse[catalogue.Voucher](t, call(t, "POST", "/api/vouchers/"+voucher.ID.String()+"/publish", nil), fiber.StatusOK)
	return voucher
}

// discounted is the acme instance at 29.00 a month with LAUNCH20 (20 % of
// the base) and WELCOME-5 (5.00 off) redeemed, subscribed through Stripe:
// its ACTIVATION is 29.00 − 5.80 − 5.00 = 18.20, both discounts on the base.
func discounted(t *testing.T) invoices.InvoiceSummary {
	t.Helper()
	s := newSold(t, "acme")
	launch := priceVoucher(t, map[string]any{
		"name": "LAUNCH20", "priceDiscountType": "PERCENTAGE", "priceDiscountValue": "20", "priceAppliesTo": "LICENSE_BASE",
	})
	welcome := priceVoucher(t, map[string]any{
		"name": "WELCOME-5", "priceDiscountType": "FIXED_AMOUNT", "priceDiscountValue": "500", "currency": "EUR", "priceAppliesTo": "BOTH",
	})
	for _, code := range []string{*launch.Code, *welcome.Code} {
		require.Equal(t, fiber.StatusCreated,
			call(t, "POST", "/api/instances/"+s.instance.Slug+"/vouchers/redeem", map[string]any{"code": code}).StatusCode)
	}
	started := subscribe(t, s)
	require.NotNil(t, started.ActivationInvoice)
	require.EqualValues(t, 1820, started.ActivationInvoice.Total)
	return *started.ActivationInvoice
}

func couponID(summary invoices.InvoiceSummary, seq, target int) string {
	return billingstripe.CouponID(summary.ID, seq, target)
}

// requireNoNegativeAmount: no request to Stripe carried a negative amount.
func requireNoNegativeAmount(t *testing.T) {
	t.Helper()
	for _, c := range fake.Calls() {
		for _, name := range []string{"amount", "amount_off"} {
			for _, v := range c.Form[name] {
				require.False(t, strings.HasPrefix(v, "-"), "%s %s carried %s=%s", c.Method, c.Path, name, v)
			}
		}
	}
}

func couponsCreated() []string {
	var ids []string
	for _, c := range fake.CallsOf(stripefake.OpCreateCoupon) {
		if id := c.Form.Get("id"); !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	slices.Sort(ids)
	return ids
}

func reconciled(i invoices.Invoice) bool {
	return i.Status == "PUSHED" && i.Provider != nil && i.Provider.ReconciliationStatus != nil
}

func TestDiscountsArePushedAsCoupons(t *testing.T) {
	for _, automaticTax := range []bool{true, false} {
		t.Run(map[bool]string{true: "AutomaticTax", false: "WithoutAutomaticTax"}[automaticTax], func(t *testing.T) {
			fresh(t)
			connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": automaticTax})
			activation := discounted(t)

			pushed := waitFor(t, activation.ID, reconciled, "pushed and reconciled")
			require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
			require.EqualValues(t, 1820, *pushed.Provider.TotalExcludingTax)

			// Kaiten's invoice is as before, plus its allocations.
			require.Len(t, pushed.Lines, 3)
			base, launch, welcome := pushed.Lines[0], pushed.Lines[1], pushed.Lines[2]
			require.Equal(t, rating.LineBase, base.Type)
			require.EqualValues(t, -580, launch.Amount)
			require.Equal(t, []rating.DiscountAllocation{{TargetSeq: 1, Amount: 580}}, launch.Discount.Allocations)
			require.EqualValues(t, -500, welcome.Amount)
			require.Equal(t, []rating.DiscountAllocation{{TargetSeq: 1, Amount: 500}}, welcome.Discount.Allocations)
			require.Equal(t, []string{couponID(activation, 2, 1)}, launch.Provider.CouponIDs)
			require.Empty(t, launch.Provider.ExternalLineID, "a DISCOUNT line is no line in Stripe")

			externalID := deref(pushed.Provider.ExternalInvoiceID)
			require.Len(t, fake.Invoices(stripefake.DefaultAccount, activation.ID.String()), 1)
			items := fake.ItemsOf(stripefake.DefaultAccount, externalID)
			require.Len(t, items, 1, "one item: the base; no item for a DISCOUNT line")
			require.Equal(t, []string{couponID(activation, 2, 1), couponID(activation, 3, 1)},
				fake.ItemCoupons(stripefake.DefaultAccount, items[0]), "the base bears both coupons, by DISCOUNT seq")
			for _, c := range fake.CallsOf(stripefake.OpCreateCoupon) {
				require.Equal(t, "once", c.Form.Get("duration"))
				require.Equal(t, "1", c.Form.Get("max_redemptions"))
				require.Equal(t, "eur", c.Form.Get("currency"))
			}
			require.Equal(t, "2900", fake.CallsOf(stripefake.OpCreateItem)[0].Form.Get("amount"))
			requireNoNegativeAmount(t)

			// The coupons served: deleted once the invoice is finalized.
			require.Eventually(t, func() bool { return len(fake.Coupons(stripefake.DefaultAccount)) == 0 }, 5e9, 25e6)
			require.Equal(t, 2, fake.Count(stripefake.OpDeleteCoupon))
		})
	}
}

// A failure after the coupons and before the item: the retry creates no
// second coupon and one item.
func TestDiscountPushResumesAfterTheCoupons(t *testing.T) {
	fresh(t)
	connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": true})
	// A 429: Stripe stores a 5xx under its key, and would replay it.
	fake.Fail(stripefake.OpCreateItem, http.StatusTooManyRequests, "rate_limit_error", "rate_limit", 1)
	activation := discounted(t)

	pushed := waitFor(t, activation.ID, reconciled, "pushed after the retry")
	require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
	require.GreaterOrEqual(t, pushed.Provider.PushAttempts, int32(1))
	require.Equal(t, []string{couponID(activation, 2, 1), couponID(activation, 3, 1)}, couponsCreated())
	require.Equal(t, 2, fake.Count(stripefake.OpCreateCoupon), "recorded coupons are not created again")
	require.Len(t, fake.ItemsOf(stripefake.DefaultAccount, deref(pushed.Provider.ExternalInvoiceID)), 1)
}

// An item whose answer was lost is adopted with its coupons, not created
// twice.
func TestDiscountPushAdoptsALostItem(t *testing.T) {
	fresh(t)
	connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": true})
	fake.DropResponse(stripefake.OpCreateItem)
	activation := discounted(t)

	pushed := waitFor(t, activation.ID, reconciled, "pushed after the retry")
	require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
	items := fake.ItemsOf(stripefake.DefaultAccount, deref(pushed.Provider.ExternalInvoiceID))
	require.Len(t, items, 1)
	require.Len(t, fake.ItemCoupons(stripefake.DefaultAccount, items[0]), 2)
	require.Equal(t, 2, fake.Count(stripefake.OpCreateCoupon))
}

// holdBeforeTheDraft keeps the push failing at the draft until heal.
func holdBeforeTheDraft(t *testing.T) func() {
	t.Helper()
	fake.Fail(stripefake.OpCreateInvoice, http.StatusTooManyRequests, "rate_limit_error", "rate_limit", 1000)
	return func() { fake.Heal(stripefake.OpCreateInvoice) }
}

// Beyond the 24-hour key horizon: a coupon an earlier attempt created is
// adopted by its id; one with another amount fails the push as
// coupon_conflict.
func TestDiscountPushBeyondTheKeyHorizon(t *testing.T) {
	t.Run("TheSameCouponIsAdopted", func(t *testing.T) {
		fresh(t)
		connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": true})
		heal := holdBeforeTheDraft(t)
		activation := discounted(t)
		waitFor(t, activation.ID, func(i invoices.Invoice) bool { return i.Status == "PUSH_FAILED" }, "held")
		fake.CreateCoupon(stripefake.DefaultAccount, couponID(activation, 2, 1), 580, "eur", activation.ID.String())
		heal()

		pushed := waitFor(t, activation.ID, reconciled, "pushed")
		require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
		require.Equal(t, 1, fake.Count(stripefake.OpRetrieveCoupon), "adopted after reading it back")
		items := fake.ItemsOf(stripefake.DefaultAccount, deref(pushed.Provider.ExternalInvoiceID))
		require.Equal(t, []string{couponID(activation, 2, 1), couponID(activation, 3, 1)}, fake.ItemCoupons(stripefake.DefaultAccount, items[0]))
	})
	t.Run("AnotherAmountIsAConflict", func(t *testing.T) {
		fresh(t)
		connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": true})
		heal := holdBeforeTheDraft(t)
		activation := discounted(t)
		waitFor(t, activation.ID, func(i invoices.Invoice) bool { return i.Status == "PUSH_FAILED" }, "held")
		fake.CreateCoupon(stripefake.DefaultAccount, couponID(activation, 2, 1), 600, "eur", activation.ID.String())
		heal()

		failed := waitFor(t, activation.ID, func(i invoices.Invoice) bool {
			return i.Status == "PUSH_FAILED" && strings.Contains(deref(i.Provider.LastPushError), "coupon_conflict")
		}, "coupon_conflict")
		require.Equal(t, 0, fake.Count(stripefake.OpCreateItem), "no item without its coupons")
		require.Contains(t, deref(failed.Provider.LastPushError), "REJECTED")
	})
}

func reviewed(t *testing.T, automaticTax bool) (invoices.InvoiceSummary, invoices.Invoice) {
	t.Helper()
	connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": automaticTax, "autoFinalize": false})
	activation := discounted(t)
	waiting := waitFor(t, activation.ID, func(i invoices.Invoice) bool {
		return i.Provider != nil && deref(i.Provider.Status) == "draft" && i.Provider.NextPushAt == nil
	}, "the draft waits for review")
	return activation, waiting
}

func retryPush(t *testing.T, summary invoices.InvoiceSummary) invoices.Invoice {
	t.Helper()
	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/invoices/"+summary.ID.String()+"/retry-push", nil).StatusCode)
	return waitFor(t, summary.ID, reconciled, "finalized by retry-push and reconciled")
}

// Review mode: the coupons stay while the draft waits, and go once it is
// finalized.
func TestDiscountCouponsStayWhileTheDraftWaits(t *testing.T) {
	fresh(t)
	activation, _ := reviewed(t, true)
	require.Equal(t, []string{couponID(activation, 2, 1), couponID(activation, 3, 1)}, fake.Coupons(stripefake.DefaultAccount))
	require.Equal(t, 0, fake.Count(stripefake.OpDeleteCoupon), "never deleted while the invoice is a draft")

	pushed := retryPush(t, activation)
	require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
	require.Eventually(t, func() bool { return len(fake.Coupons(stripefake.DefaultAccount)) == 0 }, 5e9, 25e6)
}

// A clean-up that fails leaves the coupons; the invoice is unaffected.
func TestDiscountCleanupFailureIsHarmless(t *testing.T) {
	fresh(t)
	connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": true})
	fake.Fail(stripefake.OpDeleteCoupon, http.StatusInternalServerError, "api_error", "", 2)
	activation := discounted(t)

	pushed := waitFor(t, activation.ID, reconciled, "pushed and reconciled")
	require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
	require.Eventually(t, func() bool { return fake.Count(stripefake.OpDeleteCoupon) == 2 }, 5e9, 25e6)
	require.Len(t, fake.Coupons(stripefake.DefaultAccount), 2, "left over, harmless: redeemed already")
	require.Equal(t, "PUSHED", invoice(t, activation.ID).Status)
}

// Voiding an invoice whose Stripe copy is a draft deletes the draft, then
// its coupons (§12.8).
func TestVoidingADraftDeletesItsCoupons(t *testing.T) {
	fresh(t)
	activation, waiting := reviewed(t, true)
	voided := commonfixture.AssertJSONResponse[invoices.Invoice](t,
		call(t, "POST", "/api/invoices/"+activation.ID.String()+"/void", map[string]any{"reason": "wrong price"}), fiber.StatusOK)
	require.Equal(t, "VOID", voided.Status)
	_, _, live := fake.Invoice(stripefake.DefaultAccount, deref(waiting.Provider.ExternalInvoiceID))
	require.False(t, live, "the draft is deleted")
	require.Empty(t, fake.Coupons(stripefake.DefaultAccount))
}

func TestDiscountReconciliation(t *testing.T) {
	t.Run("ACouponAddedInTheDashboardIsAnExtraDiscount", func(t *testing.T) {
		fresh(t)
		activation, waiting := reviewed(t, true)
		item := fake.ItemsOf(stripefake.DefaultAccount, deref(waiting.Provider.ExternalInvoiceID))[0]
		foreign := fake.ApplyForeignCoupon(stripefake.DefaultAccount, item, 100)

		pushed := retryPush(t, activation)
		require.Equal(t, "MISMATCH", *pushed.Provider.ReconciliationStatus)
		detail := pushed.Provider.ReconciliationDetails
		require.Len(t, detail.ExtraDiscounts, 1)
		require.Equal(t, foreign, detail.ExtraDiscounts[0].DiscountID)
		require.EqualValues(t, 100, detail.ExtraDiscounts[0].Amount)
		require.Empty(t, detail.Discounts, "Kaiten's own discounts match")
	})
	t.Run("ADiscountAmountThatDiffers", func(t *testing.T) {
		fresh(t)
		activation, waiting := reviewed(t, true)
		item := fake.ItemsOf(stripefake.DefaultAccount, deref(waiting.Provider.ExternalInvoiceID))[0]
		fake.SetDiscountAmount(stripefake.DefaultAccount, item, couponID(activation, 3, 1), 450)

		pushed := retryPush(t, activation)
		require.Equal(t, "MISMATCH", *pushed.Provider.ReconciliationStatus)
		detail := pushed.Provider.ReconciliationDetails
		require.Equal(t, []invoices.DiscountDifference{{
			LineID: *pushed.Lines[2].ID, Seq: 3, TargetSeq: 1, KaitenAmount: 500, ProviderAmount: 450, CouponID: couponID(activation, 3, 1),
		}}, detail.Discounts)
		require.EqualValues(t, 1870, detail.Totals.ProviderTotalExcludingTax)
	})
	t.Run("InclusiveTaxComparesTheSubtotalLessTheDiscounts", func(t *testing.T) {
		fresh(t)
		connect(t, map[string]any{"stripeSecretKey": testKey, "automaticTax": true, "taxBehavior": "INCLUSIVE"})
		activation := discounted(t)
		pushed := waitFor(t, activation.ID, reconciled, "pushed and reconciled")
		require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
		require.Equal(t, "inclusive", fake.CallsOf(stripefake.OpCreateItem)[0].Form.Get("tax_behavior"))
	})
}

// An item an earlier attempt added that does not bear its coupons (its
// answer lost, then edited in Stripe) is not adopted: it is deleted and added
// again under a key of its own.
func TestDiscountPushRecreatesAnItemMissingItsCoupons(t *testing.T) {
	fresh(t)
	activation, waiting := reviewed(t, true)
	item := fake.ItemsOf(stripefake.DefaultAccount, deref(waiting.Provider.ExternalInvoiceID))[0]
	fake.StripCoupons(stripefake.DefaultAccount, item)
	// Kaiten forgets the item, as when the answer that created it was lost.
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE instance_invoice SET lines = jsonb_set(lines, '{0,provider}', 'null') WHERE id = $1`, activation.ID)
	require.NoError(t, err)

	pushed := retryPush(t, activation)
	require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus, "%+v", pushed.Provider.ReconciliationDetails)
	require.Equal(t, 1, fake.Count(stripefake.OpDeleteItem))
	items := fake.ItemsOf(stripefake.DefaultAccount, deref(pushed.Provider.ExternalInvoiceID))
	require.Len(t, items, 1)
	require.NotEqual(t, item, items[0])
	require.Equal(t, []string{couponID(activation, 2, 1), couponID(activation, 3, 1)}, fake.ItemCoupons(stripefake.DefaultAccount, items[0]))
	creates := fake.CallsOf(stripefake.OpCreateItem)
	require.Equal(t, activation.ID.String()+":line:1:r1", creates[len(creates)-1].IdempotencyKey)
}
