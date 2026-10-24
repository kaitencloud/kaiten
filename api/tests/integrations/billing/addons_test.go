package billing_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listaddoncompatibility"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
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
		require.Equal(t, "CreateAddon.InvalidIncreaseBilling", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/addons",
			map[string]any{"name": "x", "description": "", "pricingType": "FREE", "increaseBilling": "PRORATE"}))
		first := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "isDefault": true, "maxQuantity": 10})
		require.Equal(t, "extra-seats", first.FamilySlug)
		require.Equal(t, "TRUE_UP", first.IncreaseBilling, "the default (V31-70)")
		require.EqualValues(t, 1, first.Version)
		require.Equal(t, "Version - 1", first.VersionName)
		second := newAddon(t, map[string]any{"name": "Extra seats", "familySlug": "extra-seats", "lifecycleState": "DRAFT"})
		require.Equal(t, "extra-seats-v2", second.Slug)
		require.EqualValues(t, 2, second.Version)

		family := commonfixture.AssertJSONResponse[catalogue.AddonFamily](t, call(t, "GET", "/api/addon-families/extra-seats", nil), fiber.StatusOK)
		require.Len(t, family.Versions, 2)
		require.Equal(t, first.ID, family.CurrentVersion.ID)
		drafts := commonfixture.AssertJSONResponse[pagination.Page[catalogue.Addon]](t, call(t, "GET", "/api/addons?lifecycleState=DRAFT", nil), fiber.StatusOK)
		require.Len(t, drafts.Items, 1)

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
		require.Equal(t, "TRUE_UP", visible.IncreaseBilling, "an absent member keeps the stored value")
		require.Len(t, outboxPayloads(t, "ADDON_UPDATED"), 3, "one per version of the family")
		boundary := commonfixture.AssertJSONResponse[catalogue.AddonFamily](t,
			call(t, "PATCH", "/api/addon-families/extra-seats", map[string]any{"increaseBilling": "NEXT_BOUNDARY"}), fiber.StatusOK)
		require.True(t, boundary.IsPublic)
		require.Equal(t, "NEXT_BOUNDARY", boundary.IncreaseBilling)
		require.Equal(t, "NEXT_BOUNDARY", boundary.Versions[0].IncreaseBilling, "every version reads its family's")
		require.Len(t, outboxPayloads(t, "ADDON_UPDATED"), 5)
		require.Equal(t, "UpdateAddonFamily.InvalidIncreaseBilling", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH",
			"/api/addon-families/extra-seats", map[string]any{"increaseBilling": "LATER"}))

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
		require.Nil(t, attached.PendingQuantity, "no decrease scheduled")
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

		// Flat fees, none for the subscription's period (§10.2).
		annual := flatFee("9000", "ANNUAL")
		annual["isDefault"] = true
		addonPrice(t, addon.Slug, annual)
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

	// §10.4, §8.2 rule 4 (PR20-03): an add-on's metered price bills the
	// usage of its attachment's window, under the add-on's ids.
	t.Run("AMeteredAddon_BillsTheUsageOfItsWindow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newEntitlement(t, "tokens", 10000)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Token pack", "slug": "token-pack"})
		addonGrant(t, addon.Slug, "tokens", 100000, "ADD")
		price := addonPrice(t, addon.Slug, metered("USAGE_BASED", "tokens", "50"))
		fits(t, addon.Slug, s.version.Slug)
		started := subscribe(t, s.instance.Slug, map[string]any{
			"basePriceId": s.monthly.ID, "startAt": time.Now().UTC().AddDate(0, -1, 0).Add(3 * time.Second),
		})
		attached := attach(t, s.instance.Slug, addon.Slug, 1)
		reportTokens(t, s.instance.Slug, 20000)
		time.Sleep(time.Until(started.CurrentPeriodEnd.Add(100 * time.Millisecond)))

		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		require.Zero(t, report.Held)
		renewal := getInvoice(t, report.Invoices[0].ID)
		var usage *rating.InvoiceLine
		for i := range renewal.Lines {
			if renewal.Lines[i].Type == rating.LineUsage {
				usage = &renewal.Lines[i]
			}
		}
		require.NotNil(t, usage, "%+v", renewal.Lines)
		require.Equal(t, price.ID, *usage.AddonPriceID)
		require.Equal(t, attached.ID, *usage.InstanceAddonID)
		require.Nil(t, usage.LicensePriceID)
		require.Equal(t, "20000", usage.Metering.MeasuredQuantity)
		require.Equal(t, "2", usage.Quantity, "per 10,000 tokens")
		require.EqualValues(t, 100, usage.Amount)
		require.True(t, usage.ServiceFrom.Equal(attached.AttachedAt), "from the attachment")
		require.True(t, usage.ServiceTo.Equal(started.CurrentPeriodEnd))
	})

	// §10.4: an ARREARS fee is billed for the period an attachment was held
	// in, even when it was removed before the boundary (proposed, §24).
	t.Run("AnArrearsAddonRemovedMidPeriod_IsBilledForItsWindow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Support", "slug": "support"})
		fee := flatFee("1500", "MONTHLY")
		fee["isDefault"], fee["billingTiming"] = true, "ARREARS"
		addonPrice(t, addon.Slug, fee)
		fits(t, addon.Slug, s.version.Slug)
		started := subscribe(t, s.instance.Slug, map[string]any{
			"basePriceId": s.monthly.ID, "startAt": time.Now().UTC().AddDate(0, -1, 0).Add(3 * time.Second),
		})
		attached := attach(t, s.instance.Slug, addon.Slug, 2)
		require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", "/api/instances/"+s.instance.Slug+"/addons/"+addon.Slug, nil).StatusCode)
		time.Sleep(time.Until(started.CurrentPeriodEnd.Add(100 * time.Millisecond)))

		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		renewal := getInvoice(t, report.Invoices[0].ID)
		var line *rating.InvoiceLine
		for i := range renewal.Lines {
			if renewal.Lines[i].Type == rating.LineAddon {
				line = &renewal.Lines[i]
			}
		}
		require.NotNil(t, line, "%+v", renewal.Lines)
		require.Equal(t, attached.ID, *line.InstanceAddonID)
		require.Equal(t, "2", line.Quantity, "the last quantity held")
		require.EqualValues(t, 3000, line.Amount, "in full")
		require.True(t, line.ServiceFrom.Equal(attached.AttachedAt))
		require.True(t, line.ServiceTo.Before(started.CurrentPeriodEnd), "to the removal")
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

		stranded := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "PUT", path, map[string]any{"licensePriceId": annual.ID}),
			fiber.StatusUnprocessableEntity)
		require.Len(t, stranded.Errors, 1)
		require.Equal(t, []any{"support"}, stranded.Errors[0].Value, "Appendix A: errors[0].value lists the add-on slugs")
	})

	// §8.2 rule 3, V31-21: one entitlement is billed by one price, so a plan
	// change cannot bring a metered price of what a held add-on meters.
	t.Run("APlanChange_ThatMetersWhatAnAddonMeters_IsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newEntitlement(t, "tokens", 0)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Token pack", "slug": "token-pack"})
		addonGrant(t, addon.Slug, "tokens", 100000, "ADD")
		addonPrice(t, addon.Slug, metered("USAGE_BASED", "tokens", "50"))
		fits(t, addon.Slug, s.version.Slug)
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		attach(t, s.instance.Slug, addon.Slug, 1)
		scale := newVersion(t, "Scale", licenseschema.Published)
		fits(t, addon.Slug, scale.Slug)
		target := createPrice(t, scale.Slug, flatFee("4900", "MONTHLY"))
		grant(t, scale.Slug, "tokens", 1000, 0)
		createPrice(t, scale.Slug, metered("USAGE_BASED", "tokens", "1"))
		path := "/api/instances/" + s.instance.Slug + "/billing/scheduled-change"

		refusal := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "PUT", path, map[string]any{"licensePriceId": target.ID}),
			fiber.StatusUnprocessableEntity)
		require.Equal(t, "SchedulePlanChange.MeteredEntitlementConflict", refusal.Code)
		require.Len(t, refusal.Errors, 1)
		require.Equal(t, "addons.token-pack", refusal.Errors[0].Location)
		require.Equal(t, map[string]any{"entitlementSlug": "tokens", "addonSlug": "token-pack"}, refusal.Errors[0].Value)
	})
}

// backdateWithInvoices moves a subscription back by months as backdate does,
// and its invoices with it -- their boundaries and their lines' service
// periods -- as if it had been subscribed that long ago.
func backdateWithInvoices(t *testing.T, subscriptionID any, months int) {
	t.Helper()
	backdate(t, subscriptionID, months)
	exec(t, `UPDATE instance_invoice i
	            SET boundary_at = i.boundary_at - make_interval(months => $2),
	                lines = (SELECT coalesce(jsonb_agg(jsonb_set(jsonb_set(l,
	                                  '{serviceFrom}', to_jsonb((l->>'serviceFrom')::timestamptz - make_interval(months => $2))),
	                                  '{serviceTo}', to_jsonb((l->>'serviceTo')::timestamptz - make_interval(months => $2)))
	                                  ORDER BY ord), '[]'::jsonb)
	                         FROM jsonb_array_elements(i.lines) WITH ORDINALITY AS e(l, ord))
	          WHERE i.instance_billing_id = $1`, subscriptionID, months)
}

// V31-70, §10.4: at a RENEWAL, each ADVANCE attachment of a TRUE_UP family is
// billed for the units it held above what the previous boundary billed it in
// advance; NEXT_BOUNDARY families and ARREARS fees never are.
func TestAddonTrueUp(t *testing.T) {
	addonLines := func(t *testing.T, invoiceID uuid.UUID) (advance, trueUps []rating.InvoiceLine) {
		t.Helper()
		for _, line := range getInvoice(t, invoiceID).Lines {
			switch {
			case line.Type != rating.LineAddon:
			case line.TrueUp != nil:
				trueUps = append(trueUps, line)
			default:
				advance = append(advance, line)
			}
		}
		return advance, trueUps
	}
	periodMax := func(t *testing.T, instanceID uuid.UUID) int32 {
		t.Helper()
		var highest int32
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
			`SELECT period_max_quantity FROM instance_addon WHERE instance_id = $1 AND removed_at IS NULL`, instanceID).Scan(&highest))
		return highest
	}
	setup := func(t *testing.T, timing string) (sold, subscribeinstance.StartedSubscription, string) {
		t.Helper()
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})
		fits(t, addon.Slug, s.version.Slug)
		price := flatFee("1000", "MONTHLY")
		price["isDefault"], price["billingTiming"] = true, timing
		addonPrice(t, addon.Slug, price)
		return s, subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID}), addon.Slug
	}
	quantity := func(t *testing.T, s sold, addonSlug string, n int) {
		t.Helper()
		commonfixture.AssertJSONResponse[catalogue.InstanceAddon](t,
			call(t, "PATCH", "/api/instances/"+s.instance.Slug+"/addons/"+addonSlug, map[string]any{"quantity": n}), fiber.StatusOK)
	}
	// renew moves the subscription and its invoices back a month, the
	// attachment with them to the middle of the elapsed period, and closes it.
	renew := func(t *testing.T, s sold, started subscribeinstance.StartedSubscription) closing.ClosedInvoice {
		t.Helper()
		backdateWithInvoices(t, started.ID, 1)
		exec(t, `UPDATE instance_addon SET created_at = created_at - interval '15 days' WHERE instance_id = $1`, s.instance.ID)
		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		return report.Invoices[0]
	}

	t.Run("AMidPeriodAttachAndIncrease_AreTruedUp_ToTheHighestQuantity", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s, started, addonSlug := setup(t, "ADVANCE")
		attach(t, s.instance.Slug, addonSlug, 3)
		quantity(t, s, addonSlug, 5)
		quantity(t, s, addonSlug, 4)
		require.EqualValues(t, 5, periodMax(t, s.instance.ID), "a decrease never lowers the high point")

		closed := renew(t, s, started)
		advance, trueUps := addonLines(t, closed.ID)
		require.Len(t, advance, 1)
		require.Equal(t, "4", advance[0].Quantity, "the advance of [B, next) bills the quantity at B")
		require.Len(t, trueUps, 1)
		trueUp := trueUps[0]
		require.Equal(t, rating.InvoiceLineTrueUp{MaxQuantity: 5, BilledQuantity: 0}, *trueUp.TrueUp, "attached after the previous boundary: nothing billed for it")
		require.Equal(t, "5", trueUp.Quantity)
		require.EqualValues(t, 5000, trueUp.Amount, "5 × 10.00 EUR for the elapsed period, in full")
		require.True(t, trueUp.ServiceTo.Equal(closed.BoundaryAt))
		require.True(t, trueUp.ServiceFrom.After(trueUp.ServiceTo.AddDate(0, -1, 0)), "from the attachment, not the period's start")
		require.EqualValues(t, 4, periodMax(t, s.instance.ID), "reset to the quantity at B")

		// The next period: billed 4 in advance, raised to 6.
		quantity(t, s, addonSlug, 6)
		next := renew(t, s, started)
		_, trueUps = addonLines(t, next.ID)
		require.Len(t, trueUps, 1)
		require.Equal(t, rating.InvoiceLineTrueUp{MaxQuantity: 6, BilledQuantity: 4}, *trueUps[0].TrueUp)
		require.Equal(t, "2", trueUps[0].Quantity)
	})

	t.Run("ANextBoundaryFamily_IsNotTruedUp", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s, started, addonSlug := setup(t, "ADVANCE")
		commonfixture.AssertJSONResponse[catalogue.AddonFamily](t,
			call(t, "PATCH", "/api/addon-families/extra-seats", map[string]any{"increaseBilling": "NEXT_BOUNDARY"}), fiber.StatusOK)
		attach(t, s.instance.Slug, addonSlug, 3)
		advance, trueUps := addonLines(t, renew(t, s, started).ID)
		require.Len(t, advance, 1)
		require.Empty(t, trueUps)
	})

	t.Run("AnArrearsFee_IsNeverTruedUp", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s, started, addonSlug := setup(t, "ARREARS")
		attach(t, s.instance.Slug, addonSlug, 3)
		quantity(t, s, addonSlug, 5)
		_, trueUps := addonLines(t, renew(t, s, started).ID)
		require.Empty(t, trueUps)
	})

	t.Run("AnAttachmentHeldBeforeTheSubscribe_IsBilledByTheActivation_NotTruedUp", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})
		fits(t, addon.Slug, s.version.Slug)
		price := flatFee("1000", "MONTHLY")
		price["isDefault"] = true
		addonPrice(t, addon.Slug, price)
		attach(t, s.instance.Slug, addon.Slug, 5)
		quantity(t, s, addon.Slug, 2)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.EqualValues(t, 2, periodMax(t, s.instance.ID), "the subscribe starts the period at the quantity held")
		exec(t, `UPDATE instance_addon SET created_at = created_at - interval '2 months' WHERE instance_id = $1`, s.instance.ID)
		_, trueUps := addonLines(t, renew(t, s, started).ID)
		require.Empty(t, trueUps, "billed 2 in advance by the ACTIVATION, held 2 since")
	})
}
