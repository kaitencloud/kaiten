package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/expiry"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// composite is a COMPOSITE of 30 % off the base for two invoices, 5 more
// seats and the beta flag for two billing periods (V32-03 d).
func composite(extra map[string]any) map[string]any {
	payload := percentOff("30", map[string]any{
		"name": "Launch bundle", "voucherType": "COMPOSITE", "duration": "REPEATING", "durationInPeriods": 2,
		"grants":     []map[string]any{{"entitlementSlug": "seats", "modifierType": "ADD", "modifierValue": "5"}},
		"flagGrants": []map[string]any{{"flagSlug": "beta", "variant": "on"}},
	})
	for k, v := range extra {
		payload[k] = v
	}
	return payload
}

func redemptionOf(t *testing.T, instanceSlug string) catalogue.Redemption {
	t.Helper()
	list := commonfixture.AssertJSONResponse[[]catalogue.Redemption](t, call(t, "GET", "/api/instances/"+instanceSlug+"/vouchers", nil), fiber.StatusOK)
	require.Len(t, list, 1)
	return list[0]
}

// TestCompositeVouchers: one redemption applies every part, and each keeps its
// own bound -- invoices for the PRICE part, billing periods of time for the
// grants. It expires once both are spent (§8.4 Consumption, §11.5).
func TestCompositeVouchers(t *testing.T) {
	setup := func(t *testing.T) (sold, string) {
		t.Helper()
		newEntitlement(t, "seats", 0)
		newFlag(t, "beta")
		s := newSold(t, flatFee("2900", "MONTHLY"))
		grant(t, s.version.Slug, "seats", 10, 0)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		return s, started.ID.String()
	}
	beta := func(t *testing.T, instanceSlug string) string {
		t.Helper()
		return evaluate(t, "beta", ofrep.Context{"targetingKey": "anyone", "kaiten": map[string]any{"instanceSlug": instanceSlug}}).Reason
	}
	sweep := func(t *testing.T) {
		t.Helper()
		_, err := expiry.New(uow.NewUnitOfWork(testDb.DbPool)).Pass(t.Context(), 100)
		require.NoError(t, err)
	}

	t.Run("Refusals", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		setup(t)
		for name, payload := range map[string]map[string]any{
			"OnlyAPricePart": composite(map[string]any{"grants": nil, "flagGrants": nil}),
			"OnlyGrants": {
				"name": "x", "voucherType": "COMPOSITE", "duration": "FOREVER",
				"grants": []map[string]any{{"entitlementSlug": "seats", "modifierType": "ADD", "modifierValue": "5"}},
			},
		} {
			require.Equal(t, "CreateVoucher.InvalidComposite", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/vouchers", payload), name)
		}
		partial := composite(nil)
		delete(partial, "priceAppliesTo")
		require.Equal(t, "CreateVoucher.InvalidDiscount", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/vouchers", partial))
		require.Equal(t, "CreateVoucher.FlagNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/vouchers",
			composite(map[string]any{"flagGrants": []map[string]any{{"flagSlug": "no-such-flag", "variant": "on"}}})))
	})

	t.Run("ThePricePartEndsFirst_TheGrantsKeepItActive", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s, subscriptionID := setup(t)
		voucher := newVoucher(t, composite(nil))
		require.Equal(t, "COMPOSITE", voucher.VoucherType)
		require.Len(t, voucher.Grants, 1)
		require.Len(t, voucher.FlagGrants, 1)
		publish(t, voucher)
		redemption := redeem(t, s.instance.Slug, *voucher.Code)
		require.EqualValues(t, 2, *redemption.ApplicationsMax, "the PRICE part counts invoices")
		require.NotNil(t, redemption.EffectiveExpiresAt, "the grants count billing periods")
		require.True(t, redemption.EffectiveExpiresAt.Equal(rating.AddMonthsClamped(redemption.RedeemedAt, 2)))

		// Every part applies at once.
		value, _, _ := effective(t, s.instance.ID, "seats")
		require.EqualValues(t, 15, value)
		require.Equal(t, "VOUCHER_GRANT", beta(t, s.instance.Slug))

		// Three renewals catch up while the grants' window is open: two are
		// discounted, and the redemption stays ACTIVE for its grants.
		exec(t, `UPDATE instance_voucher SET redeemed_at = redeemed_at - interval '4 months',
		           effective_starts_at = effective_starts_at - interval '4 months' WHERE id = $1`, redemption.ID)
		backdate(t, subscriptionID, 3)
		report := closePeriods(t, map[string]any{})
		require.Len(t, report.Invoices, 3)
		for i, closed := range report.Invoices {
			renewal := getInvoice(t, closed.ID)
			if i == 2 {
				require.Len(t, renewal.Lines, 1, "the PRICE part is spent")
				continue
			}
			require.Len(t, renewal.Lines, 2)
			require.Equal(t, rating.LineDiscount, renewal.Lines[1].Type)
			require.EqualValues(t, -870, renewal.Lines[1].Amount)
		}
		spent := redemptionOf(t, s.instance.Slug)
		require.Equal(t, "ACTIVE", spent.Status, "its grants still run")
		require.EqualValues(t, 2, spent.ApplicationsCount)
		require.Empty(t, outboxPayloads(t, "INSTANCE_VOUCHER_EXPIRED"))
		value, _, _ = effective(t, s.instance.ID, "seats")
		require.EqualValues(t, 15, value)

		// The window ends: step (b) expires it, both parts spent.
		exec(t, `UPDATE instance_voucher SET effective_expires_at = now() - interval '1 minute' WHERE id = $1`, redemption.ID)
		sweep(t)
		require.Equal(t, "EXPIRED", redemptionOf(t, s.instance.Slug).Status)
		require.Len(t, outboxPayloads(t, "INSTANCE_VOUCHER_EXPIRED"), 1)
		value, _, _ = effective(t, s.instance.ID, "seats")
		require.EqualValues(t, 10, value)
		require.NotEqual(t, "VOUCHER_GRANT", beta(t, s.instance.Slug))
	})

	t.Run("TheWindowEndsFirst_ThePricePartStillApplies", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s, subscriptionID := setup(t)
		voucher := newVoucher(t, composite(nil))
		publish(t, voucher)
		redemption := redeem(t, s.instance.Slug, *voucher.Code)
		exec(t, `UPDATE instance_voucher SET redeemed_at = redeemed_at - interval '4 months',
		           effective_starts_at = effective_starts_at - interval '4 months',
		           effective_expires_at = now() - interval '1 minute' WHERE id = $1`, redemption.ID)

		// The grants stop at once; step (b) leaves it, applications remain.
		value, _, _ := effective(t, s.instance.ID, "seats")
		require.EqualValues(t, 10, value)
		require.NotEqual(t, "VOUCHER_GRANT", beta(t, s.instance.Slug))
		sweep(t)
		require.Equal(t, "ACTIVE", redemptionOf(t, s.instance.Slug).Status)

		// Its window does not bound the PRICE part: the last application
		// expires it, at that composition.
		backdate(t, subscriptionID, 2)
		report := closePeriods(t, map[string]any{})
		require.Len(t, report.Invoices, 2)
		for _, closed := range report.Invoices {
			renewal := getInvoice(t, closed.ID)
			require.Len(t, renewal.Lines, 2, "discounted after the grants' window")
		}
		require.Equal(t, "EXPIRED", redemptionOf(t, s.instance.Slug).Status)
		require.Len(t, outboxPayloads(t, "INSTANCE_VOUCHER_EXPIRED"), 1)
	})
}
