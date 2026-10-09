package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getsessionportal"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const sessionPortalPath = "/api/public/session/portal"

func portalOf(t *testing.T, token string) getsessionportal.SessionPortal {
	t.Helper()
	return commonfixture.AssertJSONResponse[getsessionportal.SessionPortal](t,
		sessionCall(t, testServer, "GET", sessionPortalPath, token, storefront, nil), fiber.StatusOK)
}

// §14.4: the customer portal in one read -- for the session's instance, or,
// for a session bound to the customer only, the customer and its instances.
func TestSessionPortal(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	grant(t, pro.Slug, "seats", 10, 50)
	monthly := createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))

	customer := newCustomer(t, "acme")
	prod := newInstance(t, "Acme prod", customer.ID, pro.ID)
	staging := newInstance(t, "Acme staging", customer.ID, community.ID)
	started := subscribe(t, prod.Slug, map[string]any{"basePriceId": monthly.ID})
	addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})
	addonGrant(t, addon.Slug, "seats", 5, "ADD")
	fits(t, addon.Slug, pro.FamilySlug)
	addonPrice(t, addon.Slug, defaultFlatFee("900", "MONTHLY"))
	attach(t, prod.Slug, addon.Slug, 2)
	welcome := newVoucher(t, percentOff("20", map[string]any{"name": "Welcome"}))
	publish(t, welcome)
	redeem(t, prod.Slug, *welcome.Code)
	resp := call(t, "POST", "/api/instances/"+prod.Slug+"/entitlements/seats/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": 14}, "behavior": "append"})
	require.Less(t, resp.StatusCode, 300)
	newPublishableKey(t, storefront)

	bound := mintSession(t, testServer, customer.Slug, prod.Slug)
	portal := portalOf(t, bound.Token)
	require.Equal(t, getsessionportal.PortalCustomer{Slug: customer.Slug, Name: "acme", BillingEmail: customer.BillingEmail}, portal.Customer)
	require.Equal(t, &getsessionportal.PortalInstance{Slug: prod.Slug, Name: "Acme prod", LicenseSlug: pro.Slug, LicenseName: "Pro"}, portal.Instance)
	require.Empty(t, portal.Instances, "a bound session reads its instance")
	require.Equal(t, "ACTIVE", portal.Subscription.Status)
	require.True(t, portal.Subscription.CurrentPeriodEnd.Equal(started.CurrentPeriodEnd))

	require.Len(t, portal.Entitlements, 1)
	seats := portal.Entitlements[0]
	require.Equal(t, "seats", seats.Slug)
	require.Equal(t, "NUMBER", seats.Type)
	require.InDelta(t, 20, seats.LimitValue.Number.Value, 0, "10 from the licence, 2 × 5 from the add-on")
	require.InDelta(t, 14, *seats.CurrentValue, 0)
	require.False(t, seats.Unlimited)
	require.EqualValues(t, 50, *seats.LimitCapExceededOveragePercent)
	require.InDelta(t, 30, *seats.MaximumAllowedUsage, 0, "20 × 1.5")
	require.InDelta(t, 70, *seats.PercentageUsed, 0.0001)
	require.NotNil(t, seats.CurrentPeriodEnd, "a monthly quota has a window")
	require.Equal(t, instanceschema.SourceLicense, seats.Source)
	require.Len(t, seats.Provenance.Addons, 1)

	require.Len(t, portal.AddOns, 1)
	require.Equal(t, "Extra seats", portal.AddOns[0].Name)
	require.EqualValues(t, 2, portal.AddOns[0].Quantity)
	require.Equal(t, []getsessionportal.PortalVoucher{{
		Name: "Welcome", VoucherType: "PRICE", Status: "ACTIVE",
		EffectiveStartsAt: portal.Vouchers[0].EffectiveStartsAt, EffectiveExpiresAt: nil,
	}}, portal.Vouchers)
	require.Nil(t, portal.PaymentMethod, "NOOP: the vendor collects, nothing is saved")
	require.Equal(t, "EUR", portal.UpcomingInvoice.Currency)
	require.EqualValues(t, 2900+2*900, portal.UpcomingInvoice.Subtotal, "the renewal: the base and the add-ons, in advance")
	require.Positive(t, portal.UpcomingInvoice.DiscountTotal, "the voucher applies to the next invoice")
	require.True(t, portal.UpcomingInvoice.BoundaryAt.Equal(started.CurrentPeriodEnd))
	require.Equal(t, getsessionportal.PortalCapabilities{PaymentMethods: false, Invoices: true, Unsubscribe: true, Checkout: false}, portal.Capabilities)

	commonfixture.AssertJSONResponse[map[string]any](t,
		sessionCall(t, testServer, "POST", sessionCancelPath, bound.Token, storefront, map[string]any{}), fiber.StatusOK)
	require.False(t, portalOf(t, bound.Token).Capabilities.Unsubscribe, "already ending")

	// An instance with no subscription, on a plan bought alone.
	other := portalOf(t, mintSession(t, testServer, customer.Slug, staging.Slug).Token)
	require.Nil(t, other.Subscription)
	require.Nil(t, other.UpcomingInvoice)
	require.Empty(t, other.AddOns)
	require.True(t, other.Capabilities.Checkout, "a free public plan with a default price")
	require.False(t, other.Capabilities.Unsubscribe)

	// The customer only.
	wide := portalOf(t, mintSession(t, testServer, customer.Slug, "").Token)
	require.Nil(t, wide.Instance)
	require.Nil(t, wide.Subscription)
	require.Empty(t, wide.Entitlements)
	require.Len(t, wide.Instances, 2)
	require.Equal(t, prod.Slug, wide.Instances[0].Slug)
	require.Equal(t, "ACTIVE", *wide.Instances[0].BillingStatus)
	require.Equal(t, staging.Slug, wide.Instances[1].Slug)
	require.Nil(t, wide.Instances[1].BillingStatus, "never subscribed")
}
