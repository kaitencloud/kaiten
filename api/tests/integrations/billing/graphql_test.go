package billing_test

import (
	"encoding/json"
	"io"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"
)

func graphQL(t *testing.T, query string, variables map[string]any) map[string]any {
	t.Helper()
	resp := call(t, "POST", "/api/graphql", map[string]any{"query": query, "variables": variables})
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusOK, resp.StatusCode, string(raw))
	var out struct {
		Data   map[string]any `json:"data"`
		Errors []any          `json:"errors"`
	}
	require.NoError(t, json.Unmarshal(raw, &out))
	require.Empty(t, out.Errors, string(raw))
	return out.Data
}

// §13.14: what the console reads through GraphQL of billing.
func TestGraphQLBillingFields(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	s := newSold(t, flatFee("2900", "MONTHLY"))
	grant(t, s.version.Slug, "seats", 10, 50)
	addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "pricingType": "FREE"})
	addonGrant(t, addon.Slug, "seats", 5, "ADD")
	fits(t, addon.Slug, s.version.Slug)
	attach(t, s.instance.Slug, addon.Slug, 2)
	subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})

	data := graphQL(t, `query($slug: String!) {
	  instance(slug: $slug) {
	    billing { status providerKind currentPeriodEnd cancelAtPeriodEnd pastDueSince trialEndsAt }
	    addons { addonSlug familySlug name quantity }
	    entitlementUsage { entitlementSlug source limitCapExceededOveragePercent provenance }
	    customer { billingEmail }
	    license { pricingType requiresPaymentMethod family { isPublic }
	              prices(status: "ACTIVE") { id billingModel billingPeriod currency unitAmount unitAmountDecimal isDefault status } }
	  }
	}`, map[string]any{"slug": s.instance.Slug})
	instance := data["instance"].(map[string]any)

	billing := instance["billing"].(map[string]any)
	require.Equal(t, "ACTIVE", billing["status"])
	require.Equal(t, "NOOP", billing["providerKind"])
	require.Equal(t, false, billing["cancelAtPeriodEnd"])
	require.Equal(t, []any{map[string]any{"addonSlug": "extra-seats", "familySlug": "extra-seats", "name": "Extra seats", "quantity": float64(2)}},
		instance["addons"])
	usage := instance["entitlementUsage"].([]any)[0].(map[string]any)
	require.Equal(t, "license", usage["source"])
	require.EqualValues(t, 50, usage["limitCapExceededOveragePercent"])
	require.Len(t, usage["provenance"].(map[string]any)["addons"], 1, "camelCase, as REST: %v", usage["provenance"])
	require.Equal(t, "billing@acme.test", instance["customer"].(map[string]any)["billingEmail"])
	license := instance["license"].(map[string]any)
	require.Equal(t, "CUSTOM", license["pricingType"])
	require.Equal(t, false, license["family"].(map[string]any)["isPublic"])
	require.Equal(t, []any{map[string]any{
		"id": s.monthly.ID.String(), "billingModel": "FLAT_FEE", "billingPeriod": "MONTHLY", "currency": "EUR",
		"unitAmount": float64(2900), "unitAmountDecimal": "2900", "isDefault": false, "status": "ACTIVE",
	}}, license["prices"])
}
