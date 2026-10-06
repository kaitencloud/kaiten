package licenseprices_test

import (
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func problemCode(t *testing.T, status int, method, path string, payload any) string {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, method, path, payload), status).Code
}

func createPrice(t *testing.T, licenseSlug string, payload map[string]any) prices.Price {
	t.Helper()
	return commonfixture.AssertJSONResponse[prices.Price](t,
		call(t, "POST", "/api/licenses/"+licenseSlug+"/prices", payload), fiber.StatusCreated)
}

func listPrices(t *testing.T, licenseSlug, query string) []prices.Price {
	t.Helper()
	return commonfixture.AssertJSONResponse[[]prices.Price](t,
		call(t, "GET", "/api/licenses/"+licenseSlug+"/prices"+query, nil), fiber.StatusOK)
}

func TestLicensePriceGate(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	slug := newVersion(t, "Pro", schema.Draft)
	path := "/api/licenses/" + slug + "/prices"

	t.Run("WhenBillingIsDisabled_EveryPriceRouteIsRefused", func(t *testing.T) {
		for _, request := range []struct{ method, path string }{
			{"GET", path},
			{"POST", path},
			{"GET", path + "/00000000-0000-0000-0000-000000000001"},
			{"PATCH", path + "/00000000-0000-0000-0000-000000000001"},
			{"POST", path + "/00000000-0000-0000-0000-000000000001/deprecate"},
		} {
			var payload any
			if request.method == "POST" && request.path == path {
				payload = flatFee("2900", "MONTHLY")
			} else if request.method == "PATCH" {
				payload = map[string]any{"displayOrder": 1}
			}
			problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
				callOn(t, disabledServer, request.method, request.path, payload), fiber.StatusForbidden)
			require.Equal(t, "Billing.Disabled", problem.Code, "%s %s", request.method, request.path)
		}
	})

	t.Run("WhenTheOrganizationIsNotSoldBilling_ItIsRefused", func(t *testing.T) {
		entitlements.set(t, false, false)
		require.Equal(t, "Billing.NotEntitled", problemCode(t, fiber.StatusForbidden, "GET", path, nil))
	})

	t.Run("WhenTheEntitlementCannotBeChecked_ItIsUnavailable", func(t *testing.T) {
		entitlements.set(t, false, true)
		require.Equal(t, "Billing.EntitlementCheckUnavailable", problemCode(t, fiber.StatusServiceUnavailable, "GET", path, nil))
	})

	t.Run("WhenEnabledAndEntitled_ItAnswers", func(t *testing.T) {
		require.Empty(t, listPrices(t, slug, ""))
	})
}

func TestCreateLicensePrice(t *testing.T) {
	t.Run("AFlatFee_IsStoredWithItsDefaults_AndEmitsAnEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)

		price := createPrice(t, slug, flatFee("2900", "MONTHLY"))
		require.Equal(t, prices.ModelFlatFee, price.BillingModel)
		require.Equal(t, prices.TimingAdvance, price.BillingTiming)
		require.Equal(t, "MONTHLY", *price.BillingPeriod)
		require.Equal(t, "2900", price.UnitAmountDecimal)
		require.EqualValues(t, 2900, *price.UnitAmount)
		require.Equal(t, prices.StatusActive, price.Status)
		require.Nil(t, price.Metered)

		read := commonfixture.AssertJSONResponse[prices.Price](t,
			call(t, "GET", "/api/licenses/"+slug+"/prices/"+price.ID.String(), nil), fiber.StatusOK)
		require.Equal(t, price, read)

		var created []prices.LicensePriceEvent
		for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
			if event.EventName == "LICENSE_PRICE_CREATED" {
				var payload prices.LicensePriceEvent
				require.NoError(t, json.Unmarshal(event.Data, &payload))
				created = append(created, payload)
			}
		}
		require.Len(t, created, 1)
		require.Equal(t, price.ID, created[0].ID)
		require.Equal(t, slug, created[0].LicenseSlug)
		require.NotEmpty(t, created[0].FamilySlug)
	})

	t.Run("AFractionalAmount_KeepsItsDecimals_AndHasNoIntegerForm", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		price := createPrice(t, slug, flatFee("0.001250000000", "ANNUAL"))
		require.Equal(t, "0.00125", price.UnitAmountDecimal)
		require.Nil(t, price.UnitAmount)
	})

	t.Run("WhatTheDraftSaysAboutItself_IsChecked", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		path := "/api/licenses/" + slug + "/prices"
		newEntitlement(t, "tokens", "MONTH", 0)
		grant(t, slug, "tokens", 1000, 50)

		lowerCase := flatFee("2900", "MONTHLY")
		lowerCase["currency"] = "eur"
		unknown := flatFee("2900", "MONTHLY")
		unknown["currency"] = "ZZZ"
		noPeriod := flatFee("2900", "MONTHLY")
		delete(noPeriod, "billingPeriod")
		periodOnMetered := metered("USAGE_BASED", "tokens", "5")
		periodOnMetered["billingPeriod"] = "MONTHLY"
		advanceMetered := metered("USAGE_BASED", "tokens", "5")
		advanceMetered["billingTiming"] = "ADVANCE"
		meteredDefault := metered("USAGE_BASED", "tokens", "5")
		meteredDefault["isDefault"] = true
		flatWithMeter := flatFee("2900", "MONTHLY")
		flatWithMeter["meteredEntitlementSlug"] = "tokens"

		for name, tc := range map[string]struct {
			payload map[string]any
			code    string
		}{
			"lower-case currency":     {lowerCase, "CreateLicensePrice.InvalidCurrency"},
			"unknown currency":        {unknown, "CreateLicensePrice.InvalidCurrency"},
			"negative amount":         {flatFee("-1", "MONTHLY"), "CreateLicensePrice.InvalidAmount"},
			"thirteen decimals":       {flatFee("1.0000000000001", "MONTHLY"), "CreateLicensePrice.InvalidAmount"},
			"thirteen integer digits": {flatFee("1000000000000", "MONTHLY"), "CreateLicensePrice.InvalidAmount"},
			"not a number":            {flatFee("12,50", "MONTHLY"), "CreateLicensePrice.InvalidAmount"},
			"flat fee without period": {noPeriod, "CreateLicensePrice.InvalidPeriod"},
			"metered with period":     {periodOnMetered, "CreateLicensePrice.InvalidPeriod"},
			"flat fee with a meter":   {flatWithMeter, "CreateLicensePrice.InvalidPeriod"},
			"metered in advance":      {advanceMetered, "CreateLicensePrice.InvalidTiming"},
			"metered default":         {meteredDefault, "CreateLicensePrice.InvalidDefault"},
			"metered without meter":   {metered("OVERAGE", "", "5"), "CreateLicensePrice.EntitlementNotGranted"},
		} {
			require.Equal(t, tc.code, problemCode(t, fiber.StatusUnprocessableEntity, "POST", path, tc.payload), name)
		}
		require.Empty(t, listPrices(t, slug, ""))
	})

	t.Run("AVersionHasOneCurrency", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		createPrice(t, slug, flatFee("2900", "MONTHLY"))
		usd := flatFee("29000", "ANNUAL")
		usd["currency"] = "USD"
		require.Equal(t, "CreateLicensePrice.CurrencyMismatch",
			problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/licenses/"+slug+"/prices", usd))

		// Another version is free to price in another currency.
		other := newVersion(t, "Pro US", schema.Draft)
		createPrice(t, other, usd)
	})

	t.Run("APeriodHasAtMostOneDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		first := flatFee("2900", "MONTHLY")
		first["isDefault"] = true
		createPrice(t, slug, first)
		require.Equal(t, "CreateLicensePrice.DefaultConflict",
			problemCode(t, fiber.StatusConflict, "POST", "/api/licenses/"+slug+"/prices", first))

		annual := flatFee("29000", "ANNUAL")
		annual["isDefault"] = true
		createPrice(t, slug, annual)
	})

	t.Run("AnArchivedVersion_TakesNoNewPrice_ButAPublishedOneDoes", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		archived := newVersion(t, "Old", schema.Archived)
		require.Equal(t, "CreateLicensePrice.VersionArchived",
			problemCode(t, fiber.StatusConflict, "POST", "/api/licenses/"+archived+"/prices", flatFee("2900", "MONTHLY")))

		published := newVersion(t, "Live", schema.Published)
		createPrice(t, published, flatFee("2900", "MONTHLY"))
	})

	t.Run("AnUnknownVersion_IsNotFound", func(t *testing.T) {
		require.Equal(t, "CreateLicensePrice.LicenseNotFound",
			problemCode(t, fiber.StatusNotFound, "POST", "/api/licenses/nope/prices", flatFee("2900", "MONTHLY")))
		require.Equal(t, "ListLicensePrices.LicenseNotFound",
			problemCode(t, fiber.StatusNotFound, "GET", "/api/licenses/nope/prices", nil))
	})
}

func TestCreateMeteredLicensePrice(t *testing.T) {
	t.Run("AMeteredPrice_SnapshotsTheSaleUnitFactor_AndBillsInArrears", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		newEntitlement(t, "tokens", "MONTH", 10000)
		grant(t, slug, "tokens", 100000, 50)

		price := createPrice(t, slug, metered("OVERAGE", "tokens", "800"))
		require.Equal(t, prices.TimingArrears, price.BillingTiming)
		require.Nil(t, price.BillingPeriod)
		require.NotNil(t, price.Metered)
		require.Equal(t, "tokens", price.Metered.EntitlementSlug)
		require.Equal(t, "10000", price.Metered.SaleUnitFactor)
		require.Equal(t, "10k tokens", *price.Metered.SaleUnitSingular)

		// The factor was captured: a later change to the entitlement does not move it.
		_, err := testServer.Dependencies.DB.Exec(t.Context(),
			`UPDATE entitlement SET sale_unit_factor = 1000 WHERE slug = 'tokens'`)
		require.NoError(t, err)
		read := commonfixture.AssertJSONResponse[prices.Price](t,
			call(t, "GET", "/api/licenses/"+slug+"/prices/"+price.ID.String(), nil), fiber.StatusOK)
		require.Equal(t, "10000", read.Metered.SaleUnitFactor)
	})

	t.Run("WithoutASaleUnit_TheFactorIsOne", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		newEntitlement(t, "api-calls", "MONTH", 0)
		grant(t, slug, "api-calls", 1000, 0)
		price := createPrice(t, slug, metered("USAGE_BASED", "api-calls", "0.5"))
		require.Equal(t, "1", price.Metered.SaleUnitFactor)
	})

	t.Run("TheMeteredEntitlement_IsChecked", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		path := "/api/licenses/" + slug + "/prices"
		newEntitlement(t, "seats", "", 0)
		grant(t, slug, "seats", 10, 0)
		newEntitlement(t, "tokens", "MONTH", 0)
		newEntitlement(t, "calls", "MONTH", 0)
		grant(t, slug, "calls", 1000, 0)
		newEntitlement(t, "builds", "MONTH", 0)
		grant(t, slug, "builds", -1, -1)

		require.Equal(t, "CreateLicensePrice.EntitlementNotFound",
			problemCode(t, fiber.StatusNotFound, "POST", path, metered("USAGE_BASED", "nope", "1")))
		for name, tc := range map[string]struct {
			payload map[string]any
			code    string
		}{
			"a stock":                    {metered("USAGE_BASED", "seats", "1"), "CreateLicensePrice.EntitlementIsStock"},
			"not granted":                {metered("USAGE_BASED", "tokens", "1"), "CreateLicensePrice.EntitlementNotGranted"},
			"overage on a hard limit":    {metered("OVERAGE", "calls", "1"), "CreateLicensePrice.OverageUnreachable"},
			"overage on unlimited usage": {metered("OVERAGE", "builds", "1"), "CreateLicensePrice.OverageUnreachable"},
		} {
			require.Equal(t, tc.code, problemCode(t, fiber.StatusUnprocessableEntity, "POST", path, tc.payload), name)
		}

		createPrice(t, slug, metered("USAGE_BASED", "calls", "1"))
		require.Equal(t, "CreateLicensePrice.EntitlementAlreadyMetered",
			problemCode(t, fiber.StatusUnprocessableEntity, "POST", path, metered("USAGE_BASED", "calls", "2")))
	})
}

func TestListLicensePrices(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	slug := newVersion(t, "Pro", schema.Draft)
	newEntitlement(t, "tokens", "MONTH", 0)
	grant(t, slug, "tokens", 1000, 50)

	annual := flatFee("29000", "ANNUAL")
	annual["displayOrder"] = 2
	monthly := flatFee("2900", "MONTHLY")
	monthly["displayOrder"] = 1
	usage := metered("OVERAGE", "tokens", "3")
	usage["displayOrder"] = 3
	a := createPrice(t, slug, annual)
	m := createPrice(t, slug, monthly)
	u := createPrice(t, slug, usage)
	commonfixture.AssertJSONResponse[prices.Price](t,
		call(t, "POST", "/api/licenses/"+slug+"/prices/"+a.ID.String()+"/deprecate", nil), fiber.StatusOK)

	ids := func(list []prices.Price) []string {
		out := make([]string, len(list))
		for i, p := range list {
			out[i] = p.ID.String()
		}
		return out
	}
	require.Equal(t, []string{m.ID.String(), a.ID.String(), u.ID.String()}, ids(listPrices(t, slug, "")))
	require.Equal(t, []string{m.ID.String(), u.ID.String()}, ids(listPrices(t, slug, "?status=ACTIVE")))
	require.Equal(t, []string{a.ID.String()}, ids(listPrices(t, slug, "?status=DEPRECATED")))
	require.Equal(t, []string{u.ID.String()}, ids(listPrices(t, slug, "?billingModel=OVERAGE")))
}

func TestUpdateLicensePrice(t *testing.T) {
	t.Run("ADraftVersionsPrice_IsEdited_AndTheEventNamesWhatChanged", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		price := createPrice(t, slug, flatFee("2900", "MONTHLY"))

		updated := commonfixture.AssertJSONResponse[prices.Price](t,
			call(t, "PATCH", "/api/licenses/"+slug+"/prices/"+price.ID.String(), map[string]any{
				"unitAmountDecimal": "3900", "displayLabel": "Pro monthly", "displayOrder": 0,
			}), fiber.StatusOK)
		require.Equal(t, "3900", updated.UnitAmountDecimal)
		require.Equal(t, "Pro monthly", *updated.DisplayLabel)
		require.Equal(t, "EUR", updated.Currency)

		var changed [][]string
		for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
			if event.EventName == "LICENSE_PRICE_UPDATED" {
				var payload prices.LicensePriceUpdatedEvent
				require.NoError(t, json.Unmarshal(event.Data, &payload))
				changed = append(changed, payload.ChangedFields)
			}
		}
		require.Equal(t, [][]string{{"unitAmountDecimal", "displayLabel"}}, changed)
	})

	t.Run("TheMergedPrice_IsCheckedWhole", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		newEntitlement(t, "tokens", "MONTH", 0)
		grant(t, slug, "tokens", 1000, 50)
		flat := createPrice(t, slug, flatFee("2900", "MONTHLY"))
		usage := createPrice(t, slug, metered("USAGE_BASED", "tokens", "1"))

		require.Equal(t, "UpdateLicensePrice.InvalidAmount", problemCode(t, fiber.StatusUnprocessableEntity,
			"PATCH", "/api/licenses/"+slug+"/prices/"+flat.ID.String(), map[string]any{"unitAmountDecimal": "-5"}))
		require.Equal(t, "UpdateLicensePrice.InvalidTiming", problemCode(t, fiber.StatusUnprocessableEntity,
			"PATCH", "/api/licenses/"+slug+"/prices/"+usage.ID.String(), map[string]any{"billingTiming": "ADVANCE"}))
		require.Equal(t, "UpdateLicensePrice.InvalidDefault", problemCode(t, fiber.StatusUnprocessableEntity,
			"PATCH", "/api/licenses/"+slug+"/prices/"+usage.ID.String(), map[string]any{"isDefault": true}))
	})

	t.Run("APublishedVersionsPrice_IsImmutable", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Published)
		price := createPrice(t, slug, flatFee("2900", "MONTHLY"))
		require.Equal(t, "UpdateLicensePrice.VersionNotDraft", problemCode(t, fiber.StatusConflict,
			"PATCH", "/api/licenses/"+slug+"/prices/"+price.ID.String(), map[string]any{"unitAmountDecimal": "3900"}))
	})

	t.Run("AnUnknownPrice_IsNotFound", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		require.Equal(t, "UpdateLicensePrice.NotFound", problemCode(t, fiber.StatusNotFound,
			"PATCH", "/api/licenses/"+slug+"/prices/00000000-0000-0000-0000-000000000001", map[string]any{"displayOrder": 1}))
	})
}

func TestDeprecateLicensePrice(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	slug := newVersion(t, "Pro", schema.Published)
	monthly := flatFee("2900", "MONTHLY")
	monthly["isDefault"] = true
	price := createPrice(t, slug, monthly)
	path := "/api/licenses/" + slug + "/prices/" + price.ID.String() + "/deprecate"

	deprecated := commonfixture.AssertJSONResponse[prices.Price](t, call(t, "POST", path, nil), fiber.StatusOK)
	require.Equal(t, prices.StatusDeprecated, deprecated.Status)
	require.NotNil(t, deprecated.DeprecatedAt)
	require.False(t, deprecated.IsDefault, "a deprecated price is no longer a default")

	require.Equal(t, "DeprecateLicensePrice.AlreadyDeprecated", problemCode(t, fiber.StatusConflict, "POST", path, nil))
	require.Equal(t, "DeprecateLicensePrice.NotFound", problemCode(t, fiber.StatusNotFound,
		"POST", "/api/licenses/"+slug+"/prices/00000000-0000-0000-0000-000000000001/deprecate", nil))

	// The period's default slot is free again.
	createPrice(t, slug, monthly)

	var names []string
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName == "LICENSE_PRICE_DEPRECATED" {
			names = append(names, event.EventName)
		}
	}
	require.Len(t, names, 1)
}
