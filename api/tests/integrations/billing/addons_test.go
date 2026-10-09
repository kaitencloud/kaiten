package billing_test

import (
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listaddoncompatibility"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func newAddon(t *testing.T, payload map[string]any) catalogue.Addon {
	t.Helper()
	if _, ok := payload["description"]; !ok {
		payload["description"] = "per unit"
	}
	if _, ok := payload["pricingType"]; !ok {
		payload["pricingType"] = "PAID"
	}
	return commonfixture.AssertJSONResponse[catalogue.Addon](t, call(t, "POST", "/api/addons", payload), fiber.StatusCreated)
}

func addonPrice(t *testing.T, addonSlug string, payload map[string]any) prices.Price {
	t.Helper()
	return commonfixture.AssertJSONResponse[prices.Price](t,
		call(t, "POST", "/api/addons/"+addonSlug+"/prices", payload), fiber.StatusCreated)
}

func addonGrant(t *testing.T, addonSlug, entitlementSlug string, value float64, behavior string) {
	t.Helper()
	commonfixture.AssertJSONResponse[catalogue.AddonEntitlement](t, call(t, "POST", "/api/addons/"+addonSlug+"/entitlements", map[string]any{
		"entitlementSlug": entitlementSlug, "value": map[string]any{"type": "number", "value": value}, "overrideBehavior": behavior,
	}), fiber.StatusCreated)
}

func fits(t *testing.T, addonSlug, familySlug string) {
	t.Helper()
	resp := call(t, "PUT", "/api/addons/"+addonSlug+"/compatible-license-families/"+familySlug, nil)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
}

func attach(t *testing.T, instanceSlug, addonSlug string, quantity int) catalogue.InstanceAddon {
	t.Helper()
	return commonfixture.AssertJSONResponse[catalogue.InstanceAddon](t, call(t, "POST", "/api/instances/"+instanceSlug+"/addons",
		map[string]any{"addonSlug": addonSlug, "quantity": quantity}), fiber.StatusCreated)
}

// effective reads an instance's effective value of an entitlement, and how
// many add-on grants contributed to it.
func effective(t *testing.T, instanceID any, entitlementSlug string) (float64, int64, bool) {
	t.Helper()
	var raw []byte
	var grants int64
	err := testDb.DbPool.QueryRow(t.Context(),
		`SELECT value, addon_grant_count FROM instance_effective_entitlement WHERE instance_id = $1 AND entitlement_slug = $2`,
		instanceID, entitlementSlug).Scan(&raw, &grants)
	if err != nil {
		return 0, 0, false
	}
	var value struct {
		Value float64 `json:"value"`
	}
	require.NoError(t, json.Unmarshal(raw, &value))
	return value.Value, grants, true
}

func TestAddonCatalogue(t *testing.T) {
	t.Run("Versions_FamiliesAndTheirLifecycle", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		first := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "isDefault": true, "maxQuantity": 10})
		require.Equal(t, "extra-seats", first.FamilySlug)
		require.EqualValues(t, 1, first.Version)
		require.Equal(t, "Version - 1", first.VersionName)
		second := newAddon(t, map[string]any{"name": "Extra seats", "familySlug": "extra-seats", "lifecycleState": "DRAFT"})
		require.Equal(t, "extra-seats-v2", second.Slug)
		require.EqualValues(t, 2, second.Version)

		family := commonfixture.AssertJSONResponse[catalogue.AddonFamily](t, call(t, "GET", "/api/addon-families/extra-seats", nil), fiber.StatusOK)
		require.Len(t, family.Versions, 2)
		require.Equal(t, first.ID, family.CurrentVersion.ID)
		drafts := commonfixture.AssertJSONResponse[[]catalogue.Addon](t, call(t, "GET", "/api/addons?lifecycleState=DRAFT", nil), fiber.StatusOK)
		require.Len(t, drafts, 1)

		require.Equal(t, "CreateAddon.SlugConflict", problemCode(t, fiber.StatusConflict, "POST", "/api/addons",
			map[string]any{"name": "x", "slug": "extra-seats", "description": "", "pricingType": "FREE"}))
		require.Equal(t, "CreateAddon.FamilyNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/addons",
			map[string]any{"name": "x", "familySlug": "nope", "description": "", "pricingType": "FREE"}))
		require.Equal(t, "CreateAddon.DefaultMustBePublished", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/addons",
			map[string]any{"name": "x", "familySlug": "extra-seats", "lifecycleState": "DRAFT", "isDefault": true, "description": "", "pricingType": "FREE"}))
		require.Equal(t, "CreateAddon.InvalidMaxQuantity", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/addons",
			map[string]any{"name": "x", "maxQuantity": 0, "description": "", "pricingType": "FREE"}))

		require.Equal(t, "ArchiveAddon.DefaultMustBePublished", problemCode(t, fiber.StatusConflict, "POST", "/api/addons/extra-seats/archive", nil))
		require.Equal(t, "PublishAddon.NotADraft", problemCode(t, fiber.StatusConflict, "POST", "/api/addons/extra-seats/publish", nil))
		published := commonfixture.AssertJSONResponse[catalogue.Addon](t, call(t, "POST", "/api/addons/extra-seats-v2/publish", nil), fiber.StatusOK)
		require.Equal(t, catalogue.Published, published.LifecycleState)

		updated := commonfixture.AssertJSONResponse[catalogue.Addon](t, call(t, "PUT", "/api/addons/extra-seats-v2", map[string]any{
			"name": "Extra seats", "description": "five per unit", "isDefault": true,
		}), fiber.StatusOK)
		require.True(t, updated.IsDefault)
		require.False(t, commonfixture.AssertJSONResponse[catalogue.Addon](t, call(t, "GET", "/api/addons/extra-seats", nil), fiber.StatusOK).IsDefault)
		changes := outboxPayloads(t, "ADDON_UPDATED")
		require.Len(t, changes, 1)
		require.ElementsMatch(t, []any{"description", "isDefault"}, changes[0]["changedFields"])

		archived := commonfixture.AssertJSONResponse[catalogue.Addon](t, call(t, "POST", "/api/addons/extra-seats/archive", nil), fiber.StatusOK)
		require.Equal(t, catalogue.Archived, archived.LifecycleState)
		require.Equal(t, "UnarchiveAddon.NotArchived", problemCode(t, fiber.StatusConflict, "POST", "/api/addons/extra-seats-v2/unarchive", nil))
		commonfixture.AssertJSONResponse[catalogue.Addon](t, call(t, "POST", "/api/addons/extra-seats/unarchive", nil), fiber.StatusOK)

		visible := commonfixture.AssertJSONResponse[catalogue.AddonFamily](t,
			call(t, "PATCH", "/api/addon-families/extra-seats", map[string]any{"isPublic": true}), fiber.StatusOK)
		require.True(t, visible.IsPublic)
		require.Len(t, outboxPayloads(t, "ADDON_UPDATED"), 3, "one per version of the family")

		require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", "/api/addons/extra-seats", nil).StatusCode)
		require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", "/api/addons/extra-seats-v2", nil).StatusCode)
		require.Equal(t, "GetAddonFamily.NotFound", problemCode(t, fiber.StatusNotFound, "GET", "/api/addon-families/extra-seats", nil),
			"a family goes with its last version")
	})

	t.Run("Prices_GrantsAndCompatibility", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newEntitlement(t, "seats", 0)
		pro := newVersion(t, "Pro", licenseschema.Published)
		addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})

		monthly := flatFee("900", "MONTHLY")
		monthly["isDefault"] = true
		price := addonPrice(t, addon.Slug, monthly)
		require.EqualValues(t, 900, *price.UnitAmount)
		usd := flatFee("100", "ANNUAL")
		usd["currency"] = "USD"
		require.Equal(t, "CreateAddonPrice.CurrencyMismatch", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/addons/extra-seats/prices", usd))
		require.Equal(t, "CreateAddonPrice.AddonNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/addons/nope/prices", monthly))
		require.Equal(t, "DeprecateAddonPrice.IsDefault", problemCode(t, fiber.StatusConflict, "POST",
			"/api/addons/extra-seats/prices/"+price.ID.String()+"/deprecate", nil))
		other := addonPrice(t, addon.Slug, flatFee("9000", "ANNUAL"))
		deprecated := commonfixture.AssertJSONResponse[prices.Price](t,
			call(t, "POST", "/api/addons/extra-seats/prices/"+other.ID.String()+"/deprecate", nil), fiber.StatusOK)
		require.Equal(t, prices.StatusDeprecated, deprecated.Status)
		active := commonfixture.AssertJSONResponse[[]prices.Price](t, call(t, "GET", "/api/addons/extra-seats/prices?status=ACTIVE", nil), fiber.StatusOK)
		require.Len(t, active, 1)
		require.Len(t, outboxPayloads(t, "ADDON_PRICE_CREATED"), 2)

		addonGrant(t, addon.Slug, "seats", 5, "ADD")
		require.Equal(t, "AssignAddonEntitlement.AlreadyAssigned", problemCode(t, fiber.StatusConflict, "POST", "/api/addons/extra-seats/entitlements",
			map[string]any{"entitlementSlug": "seats", "value": map[string]any{"type": "number", "value": 1}}))
		require.Equal(t, "AssignAddonEntitlement.EntitlementNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/addons/extra-seats/entitlements",
			map[string]any{"entitlementSlug": "nope", "value": map[string]any{"type": "number", "value": 1}}))
		updated := commonfixture.AssertJSONResponse[catalogue.AddonEntitlement](t, call(t, "PUT", "/api/addons/extra-seats/entitlements/seats",
			map[string]any{"value": map[string]any{"type": "number", "value": 10}, "overrideBehavior": "MAX", "limitCapExceededOveragePercent": 20}), fiber.StatusOK)
		require.Equal(t, "MAX", updated.OverrideBehavior)
		require.EqualValues(t, 20, *updated.LimitCapExceededOveragePercent)
		require.Equal(t, "UpdateAddonEntitlement.InvalidLimitCapExceededOveragePercent", problemCode(t, fiber.StatusUnprocessableEntity, "PUT",
			"/api/addons/extra-seats/entitlements/seats", map[string]any{"value": map[string]any{"type": "number", "value": 10}, "limitCapExceededOveragePercent": -1}))
		grants := commonfixture.AssertJSONResponse[[]catalogue.AddonEntitlement](t, call(t, "GET", "/api/addons/extra-seats/entitlements", nil), fiber.StatusOK)
		require.Len(t, grants, 1)

		fits(t, addon.Slug, pro.Slug)
		fits(t, addon.Slug, pro.Slug)
		compatible := commonfixture.AssertJSONResponse[listaddoncompatibility.CompatibleLicenseFamilies](t,
			call(t, "GET", "/api/addons/extra-seats/compatible-license-families", nil), fiber.StatusOK)
		require.Equal(t, []string{pro.Slug}, compatible.FamilySlugs)
		require.Len(t, outboxPayloads(t, "ADDON_UPDATED"), 1, "repeating the same compatibility records nothing")
		require.Equal(t, "SetAddonCompatibility.FamilyNotFound", problemCode(t, fiber.StatusNotFound, "PUT",
			"/api/addons/extra-seats/compatible-license-families/nope", nil))
		require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", "/api/addons/extra-seats/compatible-license-families/"+pro.Slug, nil).StatusCode)

		require.Equal(t, "DeleteAddon.InUseConflict", problemCode(t, fiber.StatusConflict, "DELETE", "/api/addons/extra-seats", nil),
			"a version that still grants cannot be deleted")
		require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", "/api/addons/extra-seats/entitlements/seats", nil).StatusCode)
		require.Len(t, outboxPayloads(t, "ADDON_ENTITLEMENT_UNASSIGNED"), 1)
	})

	t.Run("IsBehindTheBillingGate", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, callOn(t, disabledServer, "GET", "/api/addons", nil), fiber.StatusForbidden)
		require.Equal(t, "Billing.Disabled", problem.Code)
	})
}

func TestInstanceAddons(t *testing.T) {
	t.Run("Attach_QuantityAndDetach_MoveTheEffectiveValue", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newEntitlement(t, "seats", 0)
		newEntitlement(t, "sso", 0)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		grant(t, s.version.Slug, "seats", 10, 0)
		addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "maxQuantity": 5, "pricingType": "FREE"})
		addonGrant(t, addon.Slug, "seats", 5, "ADD")
		path := "/api/instances/" + s.instance.Slug + "/addons"

		require.Equal(t, "AttachInstanceAddon.Incompatible", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"addonSlug": addon.Slug, "quantity": 1}))
		fits(t, addon.Slug, s.version.Slug)
		require.Equal(t, "AttachInstanceAddon.QuantityExceedsMax", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"addonSlug": addon.Slug, "quantity": 6}))
		require.Equal(t, "AttachInstanceAddon.AddonNotFound", problemCode(t, fiber.StatusNotFound, "POST", path,
			map[string]any{"addonSlug": "nope", "quantity": 1}))

		attached := attach(t, s.instance.Slug, addon.Slug, 3)
		require.EqualValues(t, 3, attached.Quantity)
		require.Empty(t, attached.Prices, "an unbilled instance is billed nothing")
		value, grants, ok := effective(t, s.instance.ID, "seats")
		require.True(t, ok)
		require.EqualValues(t, 25, value, "10 from the licence + 5 × 3")
		require.EqualValues(t, 1, grants)
		require.Equal(t, "AttachInstanceAddon.FamilyAlreadyAttached", problemCode(t, fiber.StatusConflict, "POST", path,
			map[string]any{"addonSlug": addon.Slug, "quantity": 1}))

		changed := commonfixture.AssertJSONResponse[catalogue.InstanceAddon](t,
			call(t, "PATCH", path+"/"+addon.Slug, map[string]any{"quantity": 4}), fiber.StatusOK)
		require.EqualValues(t, 4, changed.Quantity)
		value, _, _ = effective(t, s.instance.ID, "seats")
		require.EqualValues(t, 30, value)
		events := outboxPayloads(t, "INSTANCE_ADDON_QUANTITY_CHANGED")
		require.Len(t, events, 1)
		require.EqualValues(t, 3, events[0]["previousQuantity"])
		require.Equal(t, "SetInstanceAddonQuantity.QuantityExceedsMax", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH",
			path+"/"+addon.Slug, map[string]any{"quantity": 6}))

		only := newAddon(t, map[string]any{"name": "SSO", "slug": "sso-pack", "pricingType": "FREE"})
		commonfixture.AssertJSONResponse[catalogue.AddonEntitlement](t, call(t, "POST", "/api/addons/sso-pack/entitlements", map[string]any{
			"entitlementSlug": "sso", "value": map[string]any{"type": "number", "value": 3},
		}), fiber.StatusCreated)
		fits(t, only.Slug, s.version.Slug)
		_, _, ok = effective(t, s.instance.ID, "sso")
		require.False(t, ok, "the licence does not grant it")
		attach(t, s.instance.Slug, only.Slug, 2)
		value, _, ok = effective(t, s.instance.ID, "sso")
		require.True(t, ok, "an entitlement granted only by an add-on")
		require.EqualValues(t, 6, value)

		require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", path+"/"+addon.Slug, nil).StatusCode)
		value, _, _ = effective(t, s.instance.ID, "seats")
		require.EqualValues(t, 10, value)
		require.Equal(t, "DetachInstanceAddon.NotAttached", problemCode(t, fiber.StatusNotFound, "DELETE", path+"/"+addon.Slug, nil))
		active := commonfixture.AssertJSONResponse[[]catalogue.InstanceAddon](t, call(t, "GET", path, nil), fiber.StatusOK)
		require.Len(t, active, 1)
		all := commonfixture.AssertJSONResponse[[]catalogue.InstanceAddon](t, call(t, "GET", path+"?includeRemoved=true", nil), fiber.StatusOK)
		require.Len(t, all, 2)
		require.NotNil(t, all[0].RemovedAt)

		commonfixture.AssertJSONResponse[catalogue.Addon](t, call(t, "POST", "/api/addons/extra-seats/archive", nil), fiber.StatusOK)
		require.Equal(t, "AttachInstanceAddon.AddonArchived", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"addonSlug": addon.Slug, "quantity": 1}))
		require.Equal(t, "DeleteAddon.InUseConflict", problemCode(t, fiber.StatusConflict, "DELETE", "/api/addons/extra-seats", nil))
	})
}

func TestAddonBilling(t *testing.T) {
	t.Run("TheRenewal_BillsTheQuantityHeldAtTheBoundary", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newEntitlement(t, "seats", 0)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})
		addonGrant(t, addon.Slug, "seats", 5, "ADD")
		fits(t, addon.Slug, s.version.Slug)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		path := "/api/instances/" + s.instance.Slug + "/addons"

		require.Equal(t, "AttachInstanceAddon.NoPriceForBillingPeriod", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"addonSlug": addon.Slug, "quantity": 1}))
		monthly := flatFee("900", "MONTHLY")
		monthly["isDefault"] = true
		price := addonPrice(t, addon.Slug, monthly)

		attached := attach(t, s.instance.Slug, addon.Slug, 2)
		require.Len(t, attached.Prices, 1)
		require.Equal(t, price.ID, attached.Prices[0].ID)
		require.Equal(t, "AssignAddonEntitlement.BillingActive", problemCode(t, fiber.StatusConflict, "POST", "/api/addons/extra-seats/entitlements",
			map[string]any{"entitlementSlug": "seats", "value": map[string]any{"type": "number", "value": 1}}))
		require.Equal(t, "CreateAddonPrice.BillingActive", problemCode(t, fiber.StatusConflict, "POST", "/api/addons/extra-seats/prices", flatFee("100", "ANNUAL")))
		commonfixture.AssertJSONResponse[catalogue.InstanceAddon](t, call(t, "PATCH", path+"/"+addon.Slug, map[string]any{"quantity": 3}), fiber.StatusOK)

		backdate(t, started.ID, 1)
		require.Equal(t, "SetInstanceAddonQuantity.BoundaryPending", problemCode(t, fiber.StatusConflict, "PATCH", path+"/"+addon.Slug,
			map[string]any{"quantity": 1}))
		pending := call(t, "DELETE", path+"/"+addon.Slug, nil)
		_ = pending.Body.Close()
		require.Equal(t, fiber.StatusConflict, pending.StatusCode)
		require.Equal(t, "60", pending.Header.Get("Retry-After"))
		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		renewal := getInvoice(t, report.Invoices[0].ID)
		require.Len(t, renewal.Lines, 2)
		require.Equal(t, rating.LineBase, renewal.Lines[0].Type)
		line := renewal.Lines[1]
		require.Equal(t, rating.LineAddon, line.Type)
		require.Equal(t, "3", line.Quantity)
		require.EqualValues(t, 2700, line.Amount, "3 × 9.00 EUR, in advance")
		require.Equal(t, price.ID, *line.AddonPriceID)
		require.Equal(t, attached.ID, *line.InstanceAddonID)
		require.Nil(t, line.LicensePriceID)
		require.EqualValues(t, 5600, renewal.Total)
	})

	t.Run("TheActivation_BillsTheAddonsAlreadyHeld", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Priority support", "slug": "support"})
		monthly := flatFee("1500", "MONTHLY")
		monthly["isDefault"] = true
		addonPrice(t, addon.Slug, monthly)
		fits(t, addon.Slug, s.version.Slug)
		attach(t, s.instance.Slug, addon.Slug, 1)

		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.NotNil(t, started.ActivationInvoice)
		require.EqualValues(t, 4400, started.ActivationInvoice.Total)
	})

	t.Run("ABilledInstance_RefusesWhatItCouldNotBill", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		path := "/api/instances/" + s.instance.Slug + "/addons"

		dollars := newAddon(t, map[string]any{"name": "US", "slug": "us"})
		usd := flatFee("100", "MONTHLY")
		usd["currency"] = "USD"
		usd["isDefault"] = true
		addonPrice(t, dollars.Slug, usd)
		fits(t, dollars.Slug, s.version.Slug)
		require.Equal(t, "AttachInstanceAddon.CurrencyMismatch", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"addonSlug": dollars.Slug, "quantity": 1}))

		draft := newAddon(t, map[string]any{"name": "Draft", "slug": "draft", "lifecycleState": "DRAFT", "pricingType": "FREE"})
		fits(t, draft.Slug, s.version.Slug)
		require.Equal(t, "AttachInstanceAddon.AddonNotPublished", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"addonSlug": draft.Slug, "quantity": 1}))
	})

	t.Run("APlanChange_ThatStrandsAnAddon_IsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Support", "slug": "support"})
		monthly := flatFee("1500", "MONTHLY")
		monthly["isDefault"] = true
		addonPrice(t, addon.Slug, monthly)
		fits(t, addon.Slug, s.version.Slug)
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		attach(t, s.instance.Slug, addon.Slug, 1)
		scale := newVersion(t, "Scale", licenseschema.Published)
		annual := createPrice(t, scale.Slug, flatFee("49000", "ANNUAL"))
		path := "/api/instances/" + s.instance.Slug + "/billing/scheduled-change"

		require.Equal(t, "SchedulePlanChange.AddonIncompatible", problemCode(t, fiber.StatusUnprocessableEntity, "PUT", path,
			map[string]any{"licensePriceId": annual.ID}), "the add-on does not fit the Scale family")
		fits(t, addon.Slug, scale.Slug)
		require.Equal(t, "SchedulePlanChange.AddonIncompatible", problemCode(t, fiber.StatusUnprocessableEntity, "PUT", path,
			map[string]any{"licensePriceId": annual.ID}), "it fits, but has no ANNUAL price")
		yearly := flatFee("15000", "ANNUAL")
		yearly["isDefault"] = true
		require.Equal(t, "CreateAddonPrice.BillingActive", problemCode(t, fiber.StatusConflict, "POST", "/api/addons/support/prices", yearly))
	})
}
