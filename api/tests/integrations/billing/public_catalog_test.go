package billing_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// publicGet reads a /api/public route the way a web page does: the key in its
// header, no Authorization, and an Origin when origin is not empty.
func publicGet(t *testing.T, server *tests.TestServer, path, key, origin string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if key != "" {
		req.Header.Set("X-Kaiten-Publishable-Key", key)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	resp, err := server.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func newPublishableKey(t *testing.T, origins ...string) keys.PublishableKeyCreated {
	t.Helper()
	if origins == nil {
		origins = []string{}
	}
	return commonfixture.AssertJSONResponse[keys.PublishableKeyCreated](t, call(t, "POST", "/api/publishable-keys",
		map[string]any{"label": "Marketing site", "allowedOrigins": origins}), fiber.StatusCreated)
}

// publicVersion is a licence version and the family it is version 1 of. The
// family slug is write-only on a licence, so the test keeps the one it sent.
type publicVersion struct {
	licenseschema.License
	FamilySlug string
}

// newDefaultVersion creates a PUBLISHED version 1 of a new family, its default.
func newDefaultVersion(t *testing.T, name, pricingType string) publicVersion {
	t.Helper()
	license := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": name, "description": name + " plan", "type": "PAID", "isDefault": true,
		"lifecycleState": licenseschema.Published, "pricingType": pricingType,
	}), fiber.StatusCreated)
	families := commonfixture.AssertJSONResponse[pagination.Page[licenseschema.LicenseFamilyView]](t,
		call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
	for _, family := range families.Items {
		if family.ID == license.FamilyID {
			return publicVersion{License: license, FamilySlug: family.Slug}
		}
	}
	t.Fatalf("no family listed for licence %s", license.Slug)
	return publicVersion{}
}

// defaultFlatFee is the headline price of its period, which self-serve needs.
func defaultFlatFee(amount, period string) map[string]any {
	price := flatFee(amount, period)
	price["isDefault"] = true
	return price
}

func makePublic(t *testing.T, familySlug string) {
	t.Helper()
	resp := call(t, "PATCH", "/api/license-families/"+familySlug, map[string]any{"isPublic": true})
	require.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func TestPublicCatalog(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	monthly := createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
	createPrice(t, pro.Slug, flatFee("29000", "ANNUAL"))
	resp := call(t, "POST", "/api/entitlements", map[string]any{
		"name": "Tokens", "slug": "tokens", "description": "tokens", "type": "NUMBER",
		"aggregationMethod": "SUM", "resetPeriod": "MONTH", "userFacing": true,
		"unitSingular": "token", "unitPlural": "tokens", "saleUnitFactor": 10000,
		"saleUnitSingular": "10k tokens", "saleUnitPlural": "10k tokens",
	})
	require.Equal(t, fiber.StatusCreated, resp.StatusCode)
	grant(t, pro.Slug, "tokens", 1_000_000, 10)
	createPrice(t, pro.Slug, metered("OVERAGE", "tokens", "0.5"))

	// A private family, and an internal entitlement on the public one: neither
	// may reach the key.
	secret := newDefaultVersion(t, "Secret", "PAID")
	createPrice(t, secret.Slug, flatFee("100", "MONTHLY"))
	newEntitlement(t, "internal-quota", 0) // not user-facing: the default
	grant(t, pro.Slug, "internal-quota", 5, 0)

	key := newPublishableKey(t, "https://www.example.com")
	require.Regexp(t, `^pk_[A-Za-z0-9_-]{43}$`, key.Key)
	require.Equal(t, key.Key[len(key.Key)-4:], key.KeyHint)

	t.Run("the key reads its organization's public catalogue", func(t *testing.T) {
		resp := publicGet(t, testServer, "/api/public/catalog", key.Key, "https://www.example.com")
		require.Equal(t, "public, max-age=60", resp.Header.Get("Cache-Control"))
		catalog := commonfixture.AssertJSONResponse[getpubliccatalog.PublicCatalog](t, resp, fiber.StatusOK)

		require.Len(t, catalog.Plans, 1, "the private family is not listed")
		plan := catalog.Plans[0]
		require.Equal(t, pro.FamilySlug, plan.FamilySlug)
		require.Equal(t, pro.Slug, plan.LicenseSlug)
		require.Equal(t, "PUBLISHED", plan.LifecycleState)
		require.Equal(t, "EUR", *plan.Currency)
		require.Len(t, plan.Prices, 3)
		byModel := map[string]getpubliccatalog.PublicPrice{}
		for _, price := range plan.Prices {
			if price.ID == monthly.ID.String() {
				byModel["MONTHLY"] = price
			}
			if price.BillingModel == "OVERAGE" {
				byModel["OVERAGE"] = price
			}
		}
		require.Equal(t, int64(2900), *byModel["MONTHLY"].UnitAmount)
		require.True(t, byModel["MONTHLY"].IsDefault)
		overage := byModel["OVERAGE"]
		require.Equal(t, "OVERAGE", overage.BillingModel)
		require.Nil(t, overage.UnitAmount, "half a cent is not a whole number of minor units")
		require.Equal(t, "0.5", overage.UnitAmountDecimal)
		require.Equal(t, "tokens", overage.Metered.EntitlementSlug)
		require.Equal(t, "10000", overage.Metered.SaleUnitFactor)

		require.Len(t, plan.Entitlements, 1, "the internal entitlement is not listed")
		require.Equal(t, "tokens", plan.Entitlements[0].Slug)
		require.JSONEq(t, `1000000`, string(plan.Entitlements[0].Value))
		require.False(t, plan.SelfServe, "PAID with no provider that captures payment methods")
		require.False(t, catalog.Capabilities.Checkout)
	})

	t.Run("a server-side read sends no Origin and passes", func(t *testing.T) {
		resp := publicGet(t, testServer, "/api/public/catalog?familySlug=nope", key.Key, "")
		catalog := commonfixture.AssertJSONResponse[getpubliccatalog.PublicCatalog](t, resp, fiber.StatusOK)
		require.Empty(t, catalog.Plans)
	})

	t.Run("an origin the key does not allow is refused", func(t *testing.T) {
		resp := publicGet(t, testServer, "/api/public/catalog", key.Key, "https://evil.example")
		require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
	})

	t.Run("an Authorization header is the wrong credential class", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/public/catalog", nil)
		req.Header.Set("X-Kaiten-Publishable-Key", key.Key)
		req.Header.Set("Authorization", "Bearer ksh_whatever")
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
		require.NoError(t, resp.Body.Close())
	})

	t.Run("listing never returns the key, and records its use", func(t *testing.T) {
		listed := commonfixture.AssertJSONResponse[[]map[string]any](t, call(t, "GET", "/api/publishable-keys", nil), fiber.StatusOK)
		require.Len(t, listed, 1)
		require.NotContains(t, listed[0], "key")
		require.Equal(t, key.KeyHint, listed[0]["keyHint"])
		require.NotNil(t, listed[0]["lastUsedAt"])
	})

	t.Run("origins can change, and apply to the next request", func(t *testing.T) {
		resp := call(t, "PATCH", "/api/publishable-keys/"+key.ID.String(),
			map[string]any{"allowedOrigins": []string{"https://evil.example"}})
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.Equal(t, fiber.StatusOK, publicGet(t, testServer, "/api/public/catalog", key.Key, "https://evil.example").StatusCode)
		require.Equal(t, fiber.StatusForbidden, publicGet(t, testServer, "/api/public/catalog", key.Key, "https://www.example.com").StatusCode)
		require.Equal(t, "UpdatePublishableKey.InvalidOrigin", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH",
			"/api/publishable-keys/"+key.ID.String(), map[string]any{"allowedOrigins": []string{"http://example.com"}}))
	})

	t.Run("a revoked key stops authenticating at once", func(t *testing.T) {
		revoked := commonfixture.AssertJSONResponse[keys.PublishableKey](t,
			call(t, "POST", "/api/publishable-keys/"+key.ID.String()+"/revoke", nil), fiber.StatusOK)
		require.NotNil(t, revoked.RevokedAt)
		require.Equal(t, fiber.StatusUnauthorized, publicGet(t, testServer, "/api/public/catalog", key.Key, "").StatusCode)
		again := commonfixture.AssertJSONResponse[keys.PublishableKey](t,
			call(t, "POST", "/api/publishable-keys/"+key.ID.String()+"/revoke", nil), fiber.StatusOK)
		require.Equal(t, revoked.RevokedAt, again.RevokedAt, "revoking twice keeps the first revocation")
		require.Equal(t, "UpdatePublishableKey.Revoked", problemCode(t, fiber.StatusConflict, "PATCH",
			"/api/publishable-keys/"+key.ID.String(), map[string]any{"label": "x"}))
		listed := commonfixture.AssertJSONResponse[[]keys.PublishableKey](t, call(t, "GET", "/api/publishable-keys", nil), fiber.StatusOK)
		require.Empty(t, listed)
		withRevoked := commonfixture.AssertJSONResponse[[]keys.PublishableKey](t,
			call(t, "GET", "/api/publishable-keys?includeRevoked=true", nil), fiber.StatusOK)
		require.Len(t, withRevoked, 1)
	})

	t.Run("no key, and an unknown key, get one answer", func(t *testing.T) {
		require.Equal(t, fiber.StatusUnauthorized, publicGet(t, testServer, "/api/public/catalog", "", "").StatusCode)
		require.Equal(t, fiber.StatusUnauthorized, publicGet(t, testServer, "/api/public/catalog", "pk_unknown", "").StatusCode)
	})
}

func TestPublicCatalogSelfServe(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	providers.use(t, false)

	paid := newDefaultVersion(t, "Team", "PAID")
	makePublic(t, paid.FamilySlug)
	createPrice(t, paid.Slug, defaultFlatFee("4900", "MONTHLY"))
	custom := newDefaultVersion(t, "Enterprise", "CUSTOM")
	makePublic(t, custom.FamilySlug)

	key := commonfixture.AssertJSONResponse[keys.PublishableKeyCreated](t, callOn(t, providerServer, "POST", "/api/publishable-keys",
		map[string]any{"label": "Pricing page", "allowedOrigins": []string{}}), fiber.StatusCreated)

	selfServe := func(t *testing.T) map[string]bool {
		t.Helper()
		catalog := commonfixture.AssertJSONResponse[getpubliccatalog.PublicCatalog](t,
			publicGet(t, providerServer, "/api/public/catalog", key.Key, ""), fiber.StatusOK)
		out := map[string]bool{}
		for _, plan := range catalog.Plans {
			out[plan.FamilySlug] = plan.SelfServe
		}
		out["paymentMethods"] = catalog.Capabilities.PaymentMethods
		return out
	}

	got := selfServe(t)
	require.False(t, got[custom.FamilySlug], "CUSTOM is never self-serve")
	// The fake provider is recorded as STRIPE but declares no payment-method
	// capture, so a PAID plan is not self-serve through it.
	require.False(t, got[paid.FamilySlug])
	require.False(t, got["paymentMethods"])

	resp := publicGet(t, providerServer, "/api/public/catalog", key.Key, "https://www.example.com")
	require.Equal(t, fiber.StatusForbidden, resp.StatusCode, "an empty allowlist admits no browser origin")
}
