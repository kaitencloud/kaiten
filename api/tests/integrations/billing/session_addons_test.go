package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// §14.4: the customer sets how many of a public add-on its instance holds --
// attached, changed, removed -- through a session bound to the instance.
func TestSessionAddonQuantity(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	monthly := createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, pro.ID)
	started := subscribe(t, instance.Slug, map[string]any{"basePriceId": monthly.ID})

	seats := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "isDefault": true, "maxQuantity": 10})
	addonGrant(t, seats.Slug, "seats", 5, "ADD")
	fits(t, seats.Slug, pro.FamilySlug)
	seatPrice := addonPrice(t, seats.Slug, defaultFlatFee("900", "MONTHLY"))
	commonfixture.AssertJSONResponse[catalogue.AddonFamily](t,
		call(t, "PATCH", "/api/addon-families/extra-seats", map[string]any{"isPublic": true}), fiber.StatusOK)
	private := newAddon(t, map[string]any{"name": "Support", "slug": "support", "isDefault": true})
	fits(t, private.Slug, pro.FamilySlug)

	newPublishableKey(t, storefront)
	bound := mintSession(t, testServer, customer.Slug, instance.Slug)
	put := func(token, addonSlug string, quantity int) *sessions.SessionAddon {
		t.Helper()
		out := commonfixture.AssertJSONResponse[sessions.SessionAddon](t, sessionCall(t, testServer, "PUT",
			"/api/public/session/addons/"+addonSlug, token, storefront, map[string]any{"quantity": quantity}), fiber.StatusOK)
		return &out
	}
	refused := func(token, addonSlug string, quantity, status int) string {
		t.Helper()
		return sessionProblem(t, sessionCall(t, testServer, "PUT", "/api/public/session/addons/"+addonSlug, token, storefront,
			map[string]any{"quantity": quantity}), status)
	}

	held := put(bound.Token, seats.Slug, 2)
	require.Equal(t, sessions.SessionAddon{
		AddonSlug: "extra-seats", FamilySlug: "extra-seats", Name: "Extra seats", Quantity: 2, MaxQuantity: held.MaxQuantity,
		Prices: held.Prices,
	}, *held)
	require.EqualValues(t, 10, *held.MaxQuantity)
	require.Len(t, held.Prices, 1)
	require.Equal(t, seatPrice.ID.String(), held.Prices[0].ID, "the flat fee of the subscription's period")
	value, _, _ := effective(t, instance.ID, "seats")
	require.EqualValues(t, 10, value, "2 × 5 seats, at once")
	require.Len(t, outboxPayloads(t, "INSTANCE_ADDON_ADDED"), 1)

	put(bound.Token, seats.Slug, 2)
	require.Empty(t, outboxPayloads(t, "INSTANCE_ADDON_QUANTITY_CHANGED"), "the quantity held: nothing changes")
	require.EqualValues(t, 5, put(bound.Token, seats.Slug, 5).Quantity)
	require.Len(t, outboxPayloads(t, "INSTANCE_ADDON_QUANTITY_CHANGED"), 1)
	require.Equal(t, "SetSessionAddonQuantity.QuantityExceedsMax", refused(bound.Token, seats.Slug, 11, fiber.StatusUnprocessableEntity))

	// A newer version becomes the public one: the instance keeps managing the
	// one it holds, and cannot hold both.
	newer := newAddon(t, map[string]any{"name": "Extra seats", "familySlug": "extra-seats", "isDefault": true})
	fits(t, newer.Slug, pro.FamilySlug)
	addonPrice(t, newer.Slug, defaultFlatFee("800", "MONTHLY"))
	require.Equal(t, "SetSessionAddonQuantity.OtherVersionAttached", refused(bound.Token, newer.Slug, 1, fiber.StatusConflict))

	// With a live subscription a decrease waits for the boundary (V31-67):
	// the quantity, the seats and the billing stay; pendingQuantity shows it.
	lowered := put(bound.Token, seats.Slug, 3)
	require.EqualValues(t, 5, lowered.Quantity)
	require.EqualValues(t, 3, *lowered.PendingQuantity)
	value, _, _ = effective(t, instance.ID, "seats")
	require.EqualValues(t, 25, value, "kept until the boundary")
	changes := outboxPayloads(t, "INSTANCE_ADDON_QUANTITY_CHANGED")
	require.Len(t, changes, 2)
	require.EqualValues(t, 5, changes[0]["quantity"], "scheduling leaves the quantity (newest first)")
	require.EqualValues(t, 3, changes[0]["pendingQuantity"])
	require.EqualValues(t, 1, *put(bound.Token, seats.Slug, 1).PendingQuantity, "a later write replaces it")
	require.Nil(t, put(bound.Token, seats.Slug, 5).PendingQuantity, "the current quantity cancels it")
	require.Len(t, outboxPayloads(t, "INSTANCE_ADDON_QUANTITY_CHANGED"), 4)
	require.EqualValues(t, 0, *put(bound.Token, seats.Slug, 0).PendingQuantity, "a removal is scheduled too")
	require.Empty(t, outboxPayloads(t, "INSTANCE_ADDON_REMOVED"))
	vendor := commonfixture.AssertJSONResponse[catalogue.InstanceAddon](t,
		call(t, "PATCH", "/api/instances/"+instance.Slug+"/addons/"+seats.Slug, map[string]any{"quantity": 5}), fiber.StatusOK)
	require.Nil(t, vendor.PendingQuantity, "a vendor write cancels it")
	require.EqualValues(t, 0, *put(bound.Token, seats.Slug, 0).PendingQuantity)

	// The boundary applies it: removed at B, after B's composition.
	backdate(t, started.ID, 1)
	require.Equal(t, 1, closePeriods(t, map[string]any{}).Closed)
	require.Len(t, outboxPayloads(t, "INSTANCE_ADDON_REMOVED"), 1)
	_, _, held5 := effective(t, instance.ID, "seats")
	require.False(t, held5, "removed at the boundary")
	require.Equal(t, "SetSessionAddonQuantity.AddonNotPublic", refused(bound.Token, seats.Slug, 1, fiber.StatusUnprocessableEntity),
		"no longer held, and no longer the public version")
	require.EqualValues(t, 0, put(bound.Token, newer.Slug, 0).Quantity, "nothing held, nothing to remove")
	require.Len(t, outboxPayloads(t, "INSTANCE_ADDON_REMOVED"), 1)
	require.EqualValues(t, 1, put(bound.Token, newer.Slug, 1).Quantity, "the public version, now that none is held")

	require.Equal(t, "SetSessionAddonQuantity.AddonNotPublic", refused(bound.Token, private.Slug, 1, fiber.StatusUnprocessableEntity))
	require.Equal(t, "SetSessionAddonQuantity.AddonNotPublic", refused(bound.Token, "no-such-addon", 1, fiber.StatusUnprocessableEntity))
	unbound := mintSession(t, testServer, customer.Slug, "")
	require.Equal(t, "SetSessionAddonQuantity.InstanceRequired", refused(unbound.Token, newer.Slug, 1, fiber.StatusUnprocessableEntity))

	backdate(t, started.ID, 1)
	pending := sessionCall(t, testServer, "PUT", "/api/public/session/addons/"+newer.Slug, bound.Token, storefront, map[string]any{"quantity": 2})
	require.Equal(t, "60", pending.Header.Get("Retry-After"))
	require.Equal(t, "SetSessionAddonQuantity.BoundaryPending", sessionProblem(t, pending, fiber.StatusConflict))
}

// V31-67, §10.4: a public decrease takes effect at the boundary. The advance
// of [B, next) bills the scheduled quantity, the quantity becomes it in the
// close's transaction, and the entitlement follows from there. Without a live
// subscription, or at a cancellation, there is no boundary to wait for.
func TestSessionAddonDecreaseIsDeferred(t *testing.T) {
	setup := func(t *testing.T) (publicVersion, catalogue.Addon, string, *instanceschema.Instance, string) {
		t.Helper()
		newEntitlement(t, "seats", 0)
		pro := newDefaultVersion(t, "Pro", "PAID")
		makePublic(t, pro.FamilySlug)
		monthly := createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
		customer := newCustomer(t, "acme")
		instance := newInstance(t, "Acme prod", customer.ID, pro.ID)
		seats := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "isDefault": true, "maxQuantity": 10})
		addonGrant(t, seats.Slug, "seats", 5, "ADD")
		fits(t, seats.Slug, pro.FamilySlug)
		addonPrice(t, seats.Slug, defaultFlatFee("900", "MONTHLY"))
		commonfixture.AssertJSONResponse[catalogue.AddonFamily](t,
			call(t, "PATCH", "/api/addon-families/extra-seats", map[string]any{"isPublic": true}), fiber.StatusOK)
		newPublishableKey(t, storefront)
		return pro, seats, monthly.ID.String(), &instance, mintSession(t, testServer, customer.Slug, instance.Slug).Token
	}
	put := func(t *testing.T, token string, quantity int) sessions.SessionAddon {
		t.Helper()
		return commonfixture.AssertJSONResponse[sessions.SessionAddon](t, sessionCall(t, testServer, "PUT",
			"/api/public/session/addons/extra-seats", token, storefront, map[string]any{"quantity": quantity}), fiber.StatusOK)
	}

	t.Run("TheRenewal_BillsTheScheduledQuantity_ThenAppliesIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		_, _, monthly, instance, token := setup(t)
		started := subscribe(t, instance.Slug, map[string]any{"basePriceId": monthly})
		put(t, token, 4)
		require.EqualValues(t, 1, *put(t, token, 1).PendingQuantity)

		backdate(t, started.ID, 1)
		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		renewal := getInvoice(t, report.Invoices[0].ID)
		var advance []string
		for _, line := range renewal.Lines {
			if line.Type == rating.LineAddon && line.TrueUp == nil {
				advance = append(advance, line.Quantity)
			}
		}
		require.Equal(t, []string{"1"}, advance, "the advance of [B, next) bills the quantity scheduled for B")

		after := commonfixture.AssertJSONResponse[[]catalogue.InstanceAddon](t, call(t, "GET", "/api/instances/"+instance.Slug+"/addons", nil), fiber.StatusOK)
		require.Len(t, after, 1)
		require.EqualValues(t, 1, after[0].Quantity)
		require.Nil(t, after[0].PendingQuantity)
		value, _, _ := effective(t, instance.ID, "seats")
		require.EqualValues(t, 5, value, "1 × 5 seats from the boundary")
		changes := outboxPayloads(t, "INSTANCE_ADDON_QUANTITY_CHANGED")
		applied := changes[0] // newest first
		require.EqualValues(t, 4, applied["previousQuantity"])
		require.EqualValues(t, 1, applied["quantity"])
		require.Nil(t, applied["pendingQuantity"])
	})

	t.Run("WithoutALiveSubscription_ADecreaseAppliesAtOnce", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		_, _, _, instance, token := setup(t)
		put(t, token, 4)
		lowered := put(t, token, 1)
		require.EqualValues(t, 1, lowered.Quantity)
		require.Nil(t, lowered.PendingQuantity)
		require.EqualValues(t, 0, put(t, token, 0).Quantity)
		require.Len(t, outboxPayloads(t, "INSTANCE_ADDON_REMOVED"), 1)
		_, _, held := effective(t, instance.ID, "seats")
		require.False(t, held)
	})

	t.Run("ACancellation_AppliesWhatWasScheduled", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		_, _, monthly, instance, token := setup(t)
		subscribe(t, instance.Slug, map[string]any{"basePriceId": monthly})
		put(t, token, 4)
		put(t, token, 2)
		cancel(t, instance.Slug, map[string]any{"mode": "IMMEDIATE"})
		after := commonfixture.AssertJSONResponse[[]catalogue.InstanceAddon](t, call(t, "GET", "/api/instances/"+instance.Slug+"/addons", nil), fiber.StatusOK)
		require.EqualValues(t, 2, after[0].Quantity, "no boundary is left to wait for")
		require.Nil(t, after[0].PendingQuantity)
	})
}
