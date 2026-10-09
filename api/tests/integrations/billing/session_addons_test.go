package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
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
	require.EqualValues(t, 3, put(bound.Token, seats.Slug, 3).Quantity)

	removed := put(bound.Token, seats.Slug, 0)
	require.EqualValues(t, 0, removed.Quantity)
	require.Len(t, outboxPayloads(t, "INSTANCE_ADDON_REMOVED"), 1)
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
