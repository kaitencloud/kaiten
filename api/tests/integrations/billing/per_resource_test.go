package billing_test

import (
	"fmt"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessioncheckout"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// newResourceEntitlement creates a SUM NUMBER entitlement that counts per
// resource and resets monthly.
func newResourceEntitlement(t *testing.T, slug string) {
	t.Helper()
	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/entitlements", map[string]any{
		"name": slug, "slug": slug, "description": slug, "type": "NUMBER", "aggregationMethod": "SUM",
		"resetPeriod": "MONTH", "limitScope": "RESOURCE",
	}), fiber.StatusCreated)
}

// reportResourceUsage appends to one resource's counter and checks it took.
func reportResourceUsage(t *testing.T, instanceSlug, entitlementSlug, resourceKey string, value float64) {
	t.Helper()
	resp := call(t, "POST", fmt.Sprintf("/api/instances/%s/entitlements/%s/resources/%s/usage", instanceSlug, entitlementSlug, resourceKey),
		map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"})
	require.Equal(t, fiber.StatusOK, resp.StatusCode)
}

// The limit is the grant's, whatever raises it: an add-on, a boost or an
// exception raises it for every resource at once.
func TestPerResourceEntitlement_AnAddonRaisesTheLimitOfEveryResource(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newResourceEntitlement(t, "sources")
	s := newSold(t, flatFee("2900", "MONTHLY"))
	grant(t, s.version.Slug, "sources", 4, 0)
	reportResourceUsage(t, s.instance.Slug, "sources", "stigg", 4)
	refused := call(t, "POST", "/api/instances/"+s.instance.Slug+"/entitlements/sources/resources/paid/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": 5}, "behavior": "append"})
	require.Equal(t, fiber.StatusConflict, refused.StatusCode, "a limit of 4 refuses a fifth source")

	addon := newAddon(t, map[string]any{"name": "Extra sources", "slug": "extra-sources", "pricingType": "FREE"})
	addonGrant(t, addon.Slug, "sources", 2, "ADD")
	fits(t, addon.Slug, s.version.Slug)
	attach(t, s.instance.Slug, addon.Slug, 1)

	value, _, _ := effective(t, s.instance.ID, "sources")
	require.EqualValues(t, 6, value, "4 from the licence, 2 from the add-on")
	reportResourceUsage(t, s.instance.Slug, "sources", "stigg", 2)
	reportResourceUsage(t, s.instance.Slug, "sources", "paid", 6)
	over := call(t, "POST", "/api/instances/"+s.instance.Slug+"/entitlements/sources/resources/schematic/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": 7}, "behavior": "append"})
	require.Equal(t, fiber.StatusConflict, over.StatusCode, "6 is the limit of each resource, and 7 is over it")
	usage := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t,
		call(t, "GET", "/api/instances/"+s.instance.Slug+"/entitlements/sources/usage", nil), fiber.StatusOK)
	require.EqualValues(t, 6, usage.Limit.Number.Value)
	require.EqualValues(t, 2, usage.Resources.AtLimit, "both resources are at the raised limit")
}

// §14.4 rule 2 for an entitlement that counts per resource: the usage a
// checkout compares with the plan's limit is the highest counter, since the
// limit applies to each.
func TestPerResourceEntitlement_CheckoutIsRefusedWhenAResourceExceedsThePlan(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newResourceEntitlement(t, "sources")
	starter := newDefaultVersion(t, "Starter", "FREE")
	makePublic(t, starter.FamilySlug)
	grant(t, starter.Slug, "sources", 10, 0)
	free := createPrice(t, starter.Slug, defaultFlatFee("0", "MONTHLY"))
	newPublishableKey(t, storefront)

	private := newVersion(t, "Internal", "PUBLISHED")
	grant(t, private.Slug, "sources", 100, 0)
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, private.ID)
	// Neither resource would exceed the starter's limit of 10 by itself with the
	// sum of both (14) in mind -- but each is measured on its own, and one is at 12.
	reportResourceUsage(t, instance.Slug, "sources", "stigg", 12)
	reportResourceUsage(t, instance.Slug, "sources", "paid", 2)
	session := mintSession(t, testServer, customer.Slug, instance.Slug)
	order := map[string]any{"licensePriceId": free.ID}

	problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
		sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, with(order, "dryRun", true)), fiber.StatusUnprocessableEntity)
	require.Equal(t, "CreateSessionCheckout.QuotaExceeded", problem.Code)
	require.Equal(t, map[string]any{"entitlementSlugs": []any{"sources"}}, problem.Errors[0].Value)

	// Once the highest counter fits, so does the plan.
	call(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/sources/resources/stigg/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": 5}, "behavior": "set"})
	done := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t,
		sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, with(order, "dryRun", false)), fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.StatusSubscribed, done.Status)
}

// The portal shows what the entitlement's own usage shows: the highest
// counter, with how many resources stand behind it.
func TestPerResourceEntitlement_ThePortalShowsTheResourcesBlock(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	newResourceEntitlement(t, "sources")
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	grant(t, pro.Slug, "seats", 10, 0)
	grant(t, pro.Slug, "sources", 4, 0)
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, pro.ID)
	reportResourceUsage(t, instance.Slug, "sources", "stigg", 4)
	reportResourceUsage(t, instance.Slug, "sources", "paid", 2)
	reportResourceUsage(t, instance.Slug, "sources", "schematic", 1)
	resp := call(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/seats/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": 3}, "behavior": "append"})
	require.Less(t, resp.StatusCode, 300)
	newPublishableKey(t, storefront)

	portal := portalOf(t, mintSession(t, testServer, customer.Slug, instance.Slug).Token)

	require.Len(t, portal.Entitlements, 2)
	bySlug := map[string]int{}
	for i, entitlement := range portal.Entitlements {
		bySlug[entitlement.Slug] = i
	}
	sources, seats := portal.Entitlements[bySlug["sources"]], portal.Entitlements[bySlug["seats"]]
	require.InDelta(t, 4, *sources.CurrentValue, 0, "the highest counter")
	require.InDelta(t, 4, sources.LimitValue.Number.Value, 0, "the limit of each resource")
	require.InDelta(t, 100, *sources.PercentageUsed, 0.0001, "the resource closest to its limit")
	require.NotNil(t, sources.Resources)
	require.EqualValues(t, 3, sources.Resources.Count)
	require.EqualValues(t, 1, sources.Resources.AtLimit)
	require.Nil(t, seats.Resources, "an entitlement that counts per instance has no resources block")
}

// A boost multiplies the one limit, so it multiplies it for each resource.
func TestPerResourceEntitlement_ABoostMovesTheLimitOfEveryResource(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newResourceEntitlement(t, "sources")
	s := newSold(t, flatFee("2900", "MONTHLY"))
	grant(t, s.version.Slug, "sources", 4, 0)
	boost := newVoucher(t, map[string]any{
		"voucherType": "ENTITLEMENT_BOOST", "duration": "REPEATING", "durationInPeriods": 2,
		"grants": []map[string]any{{"entitlementSlug": "sources", "modifierType": "MULTIPLY", "modifierValue": "3"}},
	})
	publish(t, boost)
	redemption := redeem(t, s.instance.Slug, *boost.Code)

	reportResourceUsage(t, s.instance.Slug, "sources", "stigg", 12)
	reportResourceUsage(t, s.instance.Slug, "sources", "paid", 12)
	over := call(t, "POST", "/api/instances/"+s.instance.Slug+"/entitlements/sources/resources/stigg/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": 1}, "behavior": "append"})
	require.Equal(t, fiber.StatusConflict, over.StatusCode, "4 × 3 is the limit of each")

	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST",
		"/api/instances/"+s.instance.Slug+"/vouchers/"+redemption.ID.String()+"/revoke", map[string]any{"reason": "ended"}), fiber.StatusOK)
	usage := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t,
		call(t, "GET", "/api/instances/"+s.instance.Slug+"/entitlements/sources/usage", nil), fiber.StatusOK)
	require.EqualValues(t, 4, usage.Limit.Number.Value, "the boost is gone for every resource at once")
	require.EqualValues(t, 2, usage.Resources.AtLimit, "and both are above the plain limit")
}
