package licenseprices_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func preview(t *testing.T, licenseSlug string, scenario map[string]any) rating.InvoicePreview {
	t.Helper()
	return commonfixture.AssertJSONResponse[rating.InvoicePreview](t,
		call(t, "POST", "/api/licenses/"+licenseSlug+"/invoice-preview", scenario), fiber.StatusOK)
}

func sample(slug, quantity string) map[string]any {
	return map[string]any{"sampleUsage": []map[string]any{{"entitlementSlug": slug, "quantity": quantity}}}
}

// pricedVersion is a worked-example catalogue on a DRAFT version: 29.00 EUR
// a month in advance, and 8.00 EUR per 10k tokens above a 100,000 limit that
// accepts 50 % more.
func pricedVersion(t *testing.T) string {
	t.Helper()
	slug := newVersion(t, "Pro", schema.Draft)
	newEntitlement(t, "tokens", "MONTH", 10000)
	grant(t, slug, "tokens", 100000, 50)
	monthly := flatFee("2900", "MONTHLY")
	monthly["isDefault"] = true
	createPrice(t, slug, monthly)
	createPrice(t, slug, metered("OVERAGE", "tokens", "800"))
	return slug
}

func TestPreviewLicenseInvoice(t *testing.T) {
	t.Run("ASample_IsRatedInArrears_AndTheBaseInAdvance", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := pricedVersion(t)
		before := len(commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID))

		got := preview(t, slug, sample("tokens", "130500"))

		require.Equal(t, "PREVIEW", got.Status)
		require.Equal(t, rating.KindRenewal, got.Kind)
		require.Equal(t, slug, got.LicenseSlug)
		require.Equal(t, "EUR", got.Currency)
		require.Len(t, got.Lines, 2)
		overage, base := got.Lines[0], got.Lines[1]

		require.Equal(t, rating.LineOverage, overage.Type)
		require.Equal(t, "3.05", overage.Quantity)
		require.EqualValues(t, 2440, overage.Amount)
		require.Equal(t, "30500", overage.Metering.MeasuredQuantity)
		require.Equal(t, "tokens", *overage.EntitlementSlug)
		require.False(t, overage.Capped)
		require.Equal(t, "3.05 × 8.00 EUR (per 10k tokens); 130,500 used; 30,500 above the applied limit (100,000)", overage.Description)

		require.Equal(t, rating.LineBase, base.Type)
		require.EqualValues(t, 2900, base.Amount)
		require.Equal(t, "Pro — base", base.Label)

		require.EqualValues(t, 5340, got.Subtotal)
		require.EqualValues(t, 0, got.DiscountTotal)
		require.EqualValues(t, 5340, got.Total)
		require.Empty(t, got.WouldHold)

		// The usage bills the month that ends at the boundary, the base the
		// month that starts there.
		require.True(t, overage.ServiceTo.Equal(got.BoundaryAt))
		require.True(t, base.ServiceFrom.Equal(got.BoundaryAt))
		require.True(t, rating.AddMonthsClamped(got.BoundaryAt, 1).Equal(base.ServiceTo))
		require.True(t, rating.AddMonthsClamped(got.BoundaryAt, -1).Equal(overage.ServiceFrom))
		require.WithinDuration(t, time.Now(), got.AsOf, time.Minute)

		require.Len(t, commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID), before,
			"a preview writes nothing")
	})

	t.Run("ASampleAboveWhatTheLicenceAccepts_IsCapped", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := pricedVersion(t)
		overage := preview(t, slug, sample("tokens", "300000")).Lines[0]
		require.Equal(t, "50000", overage.Metering.MeasuredQuantity)
		require.Equal(t, "5", overage.Quantity)
		require.EqualValues(t, 4000, overage.Amount)
		require.True(t, overage.Capped)
	})

	t.Run("WithoutUsage_OnlyTheBaseIsBilled", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := pricedVersion(t)
		got := preview(t, slug, map[string]any{})
		require.Len(t, got.Lines, 1)
		require.EqualValues(t, 2900, got.Total)
		got = preview(t, slug, sample("tokens", "90000"))
		require.Len(t, got.Lines, 1, "usage under the limit has no overage")
	})

	t.Run("ANamedBasePrice_SetsThePeriod_AndAnArrearsBaseBillsTheOneThatEnds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := pricedVersion(t)
		annual := flatFee("29000", "ANNUAL")
		annual["billingTiming"] = "ARREARS"
		annual["displayLabel"] = "Pro yearly"
		price := createPrice(t, slug, annual)

		got := preview(t, slug, map[string]any{"basePriceId": price.ID})
		require.Len(t, got.Lines, 1)
		require.Equal(t, "Pro yearly", got.Lines[0].Label)
		require.EqualValues(t, 29000, got.Lines[0].Amount)
		require.True(t, got.Lines[0].ServiceTo.Equal(got.BoundaryAt))
		require.True(t, rating.AddMonthsClamped(got.BoundaryAt, -12).Equal(got.Lines[0].ServiceFrom))
	})

	t.Run("TheBasePrice_MustExist", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		path := "/api/licenses/" + slug + "/invoice-preview"
		createPrice(t, slug, flatFee("2900", "MONTHLY"))
		newEntitlement(t, "calls", "MONTH", 0)
		grant(t, slug, "calls", 1000, 0)
		usage := createPrice(t, slug, metered("USAGE_BASED", "calls", "1"))

		require.Equal(t, "PreviewLicenseInvoice.NoBasePrice", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path, map[string]any{}))
		require.Equal(t, "PreviewLicenseInvoice.PriceNotFound", problemCode(t, fiber.StatusNotFound, "POST", path,
			map[string]any{"basePriceId": usage.ID}))
		require.Equal(t, "PreviewLicenseInvoice.PriceNotFound", problemCode(t, fiber.StatusNotFound, "POST", path,
			map[string]any{"basePriceId": "00000000-0000-0000-0000-000000000001"}))
		require.Equal(t, "PreviewLicenseInvoice.LicenseNotFound", problemCode(t, fiber.StatusNotFound, "POST",
			"/api/licenses/nope/invoice-preview", map[string]any{}))
	})

	t.Run("TheSample_IsChecked", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := pricedVersion(t)
		path := "/api/licenses/" + slug + "/invoice-preview"
		twice := map[string]any{"sampleUsage": []map[string]any{
			{"entitlementSlug": "tokens", "quantity": "1"}, {"entitlementSlug": "tokens", "quantity": "2"},
		}}
		for name, scenario := range map[string]map[string]any{
			"negative":     sample("tokens", "-1"),
			"not a number": sample("tokens", "lots"),
			"twice":        twice,
			"not metered":  sample("seats", "1"),
		} {
			require.Equal(t, "PreviewLicenseInvoice.InvalidSampleUsage",
				problemCode(t, fiber.StatusUnprocessableEntity, "POST", path, scenario), name)
		}
	})

	t.Run("BehindTheBillingGate", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := pricedVersion(t)
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
			callOn(t, disabledServer, "POST", "/api/licenses/"+slug+"/invoice-preview", map[string]any{}), fiber.StatusForbidden)
		require.Equal(t, "Billing.Disabled", problem.Code)
	})
}

// §8.9: the listed add-ons are priced in, their grants raise the sample's
// limit (§7.2), and a voucher's discount applies as a redemption would.
func TestPreviewWithAddonsAndAVoucher(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	slug := pricedVersion(t)
	created := func(path string, body map[string]any) {
		t.Helper()
		resp := call(t, "POST", path, body)
		_ = resp.Body.Close()
		require.Less(t, resp.StatusCode, 300, path)
	}
	created("/api/addons", map[string]any{"name": "Token pack", "slug": "token-pack", "description": "d", "pricingType": "PAID"})
	created("/api/addons/token-pack/entitlements", map[string]any{
		"entitlementSlug": "tokens", "value": map[string]any{"type": "number", "value": 10000}, "overrideBehavior": "ADD",
	})
	fee := flatFee("500", "MONTHLY")
	fee["isDefault"] = true
	created("/api/addons/token-pack/prices", fee)

	// 130,500 used: 30,500 above 100,000; with 3 packs the limit is 130,000.
	got := preview(t, slug, map[string]any{
		"sampleUsage": []map[string]any{{"entitlementSlug": "tokens", "quantity": "130500"}},
		"addOns":      []map[string]any{{"addonSlug": "token-pack", "quantity": 3}},
	})
	byType := map[rating.LineType]rating.InvoiceLine{}
	for _, line := range got.Lines {
		byType[line.Type] = line
	}
	require.Equal(t, "500", byType[rating.LineOverage].Metering.MeasuredQuantity, "above 100,000 + 3 × 10,000")
	require.EqualValues(t, 1500, byType[rating.LineAddon].Amount, "3 × 5.00 EUR")
	require.Equal(t, "3", byType[rating.LineAddon].Quantity)

	created("/api/vouchers", map[string]any{
		"name": "Launch", "code": "LAUNCH-2027-SPRING", "voucherType": "PRICE", "duration": "FOREVER",
		"priceDiscountType": "PERCENTAGE", "priceDiscountValue": "10", "priceAppliesTo": "LICENSE_BASE",
	})
	// A DRAFT voucher discounts nothing yet.
	problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
		call(t, "POST", "/api/licenses/"+slug+"/invoice-preview", map[string]any{"voucherCode": "LAUNCH-2027-SPRING"}), fiber.StatusUnprocessableEntity)
	require.Equal(t, "PreviewLicenseInvoice.VoucherInvalid", problem.Code)
	var voucherID string
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `SELECT id::text FROM voucher WHERE name = 'Launch'`).Scan(&voucherID))
	created("/api/vouchers/"+voucherID+"/publish", nil)
	discounted := preview(t, slug, map[string]any{"voucherCode": "launch-2027-spring"})
	require.EqualValues(t, 290, discounted.DiscountTotal, "10 % of the 29.00 EUR base")
	require.EqualValues(t, 2610, discounted.Total)

	for code, body := range map[string]map[string]any{
		"PreviewLicenseInvoice.AddonNotFound":   {"addOns": []map[string]any{{"addonSlug": "nope", "quantity": 1}}},
		"PreviewLicenseInvoice.VoucherNotFound": {"voucherCode": "NOPE-NOPE-NOPE"},
	} {
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
			call(t, "POST", "/api/licenses/"+slug+"/invoice-preview", body), fiber.StatusNotFound)
		require.Equal(t, code, problem.Code)
	}
	problem = commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "POST", "/api/licenses/"+slug+"/invoice-preview",
		map[string]any{"addOns": []map[string]any{{"addonSlug": "token-pack", "quantity": 0}}}), fiber.StatusUnprocessableEntity)
	require.Equal(t, "PreviewLicenseInvoice.InvalidAddOns", problem.Code)
}
