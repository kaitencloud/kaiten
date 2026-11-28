package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// userFacing makes an entitlement a vendor shows its customers: in the public
// catalogue and in the customer portal.
func userFacing(payload map[string]any) { payload["userFacing"] = true }

// newCombinedEntitlement creates a combined entitlement through the API: the
// weighted sum of the sources, each named with its weight.
func newCombinedEntitlement(t *testing.T, slug string, sources [][2]string, mutate ...func(map[string]any)) {
	t.Helper()
	named := make([]map[string]string, len(sources))
	for i, s := range sources {
		named[i] = map[string]string{"entitlementSlug": s[0], "weight": s[1]}
	}
	payload := map[string]any{
		"name": slug, "slug": slug, "description": slug, "type": "NUMBER",
		"usageSource": "COMBINED_USAGE", "sources": named,
	}
	for _, m := range mutate {
		m(payload)
	}
	require.Equal(t, fiber.StatusCreated, call(t, "POST", "/api/entitlements", payload).StatusCode)
}

func appendUsage(t *testing.T, instanceSlug, entitlementSlug string, value float64) {
	t.Helper()
	resp := call(t, "POST", "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"})
	require.Less(t, resp.StatusCode, 300)
}

func usageOf(t *testing.T, instanceSlug string) map[string]instanceschema.EntitlementUsage {
	t.Helper()
	list := commonfixture.AssertJSONResponse[[]instanceschema.EntitlementUsage](t,
		call(t, "GET", "/api/instances/"+instanceSlug+"/entitlements/usage", nil), fiber.StatusOK)
	bySlug := make(map[string]instanceschema.EntitlementUsage, len(list))
	for _, usage := range list {
		bySlug[usage.EntitlementSlug] = usage
	}
	return bySlug
}

// The portal lists what the vendor made user-facing, as the public catalogue
// does: an internal counter never reaches the browser.
func TestSessionPortal_HidesEntitlementsThatAreNotUserFacing(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0, userFacing)
	newEntitlement(t, "internal-quota", 0) // not user-facing: the default
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	grant(t, pro.Slug, "seats", 10, 0)
	grant(t, pro.Slug, "internal-quota", 5, 0)
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, pro.ID)
	appendUsage(t, instance.Slug, "seats", 3)
	appendUsage(t, instance.Slug, "internal-quota", 4)
	newPublishableKey(t, storefront)

	portal := portalOf(t, mintSession(t, testServer, customer.Slug, instance.Slug).Token)

	require.Len(t, portal.Entitlements, 1)
	assert.Equal(t, "seats", portal.Entitlements[0].Slug)
	assert.InDelta(t, 3, *portal.Entitlements[0].CurrentValue, 0)
	assert.Len(t, usageOf(t, instance.Slug), 2, "the organization's credential still reads both")
}

// A combined entitlement is the way to show a customer one line over two it
// must not see: the sources are internal, and the total is user-facing.
func TestSessionPortal_ACombinedEntitlementIsATotalOnly(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "firecrawl-credits", 0)
	newEntitlement(t, "scraped-pages", 0)
	newCombinedEntitlement(t, "credits", [][2]string{{"firecrawl-credits", "0.4"}, {"scraped-pages", "0.6"}}, userFacing)
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	grant(t, pro.Slug, "firecrawl-credits", 1000, 0)
	grant(t, pro.Slug, "scraped-pages", 1000, 0)
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, pro.ID)
	appendUsage(t, instance.Slug, "firecrawl-credits", 300)
	appendUsage(t, instance.Slug, "scraped-pages", 100)
	newPublishableKey(t, storefront)
	token := mintSession(t, testServer, customer.Slug, instance.Slug).Token

	portal := portalOf(t, token)

	require.Len(t, portal.Entitlements, 1, "the total, not the two behind it")
	credits := portal.Entitlements[0]
	assert.Equal(t, "credits", credits.Slug)
	assert.Equal(t, "NUMBER", credits.Type)
	assert.InDelta(t, 1000, credits.LimitValue.Number.Value, 0)
	assert.InDelta(t, 180, *credits.CurrentValue, 1e-9)
	assert.InDelta(t, 18, *credits.PercentageUsed, 1e-9)
	assert.InDelta(t, 1000, *credits.MaximumAllowedUsage, 0)
	assert.False(t, credits.Unlimited)
	assert.Equal(t, instanceschema.SourceLicense, credits.Source)
	assert.NotNil(t, credits.CurrentPeriodEnd, "the window of the sources")

	t.Run("TheBrowserGetsTheTotalAndNoDetail", func(t *testing.T) {
		raw := commonfixture.AssertJSONResponse[map[string]any](t, sessionCall(t, testServer, "GET", sessionPortalPath, token, storefront, nil), fiber.StatusOK)
		entitlements := raw["entitlements"].([]any)
		require.Len(t, entitlements, 1)
		assert.NotContains(t, entitlements[0], "sources", "an organization credential gets the detail per source, a customer the total")
	})

	t.Run("TheOrganizationsCredentialGetsTheDetail", func(t *testing.T) {
		usage := usageOf(t, instance.Slug)["credits"]
		require.Len(t, usage.Sources, 2)
		assert.Equal(t, "firecrawl-credits", usage.Sources[0].EntitlementSlug)
	})
}

// The catalogue lists a user-facing combined entitlement among what a plan
// grants: the weighted sum of what the version grants of its sources.
func TestPublicCatalog_ACombinedEntitlement(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "firecrawl-credits", 0)
	newEntitlement(t, "scraped-pages", 0)
	newCombinedEntitlement(t, "credits", [][2]string{{"firecrawl-credits", "0.4"}, {"scraped-pages", "0.6"}}, userFacing,
		func(p map[string]any) { p["unitSingular"], p["unitPlural"], p["displayOrder"] = "credit", "credits", 5 })
	newCombinedEntitlement(t, "internal-total", [][2]string{{"firecrawl-credits", "1"}, {"scraped-pages", "1"}}) // not user-facing
	newEntitlement(t, "seats", 0, userFacing, func(p map[string]any) { delete(p, "resetPeriod") })

	plan := func(name string, grants func(slug string)) planRef {
		version := newDefaultVersion(t, name, "PAID")
		makePublic(t, version.FamilySlug)
		createPrice(t, version.Slug, defaultFlatFee("2900", "MONTHLY"))
		grants(version.Slug)
		return planRef{version.Slug}
	}
	pro := plan("Pro", func(slug string) {
		grant(t, slug, "firecrawl-credits", 1000, 0)
		grant(t, slug, "scraped-pages", 1000, 0)
		grant(t, slug, "seats", 10, 0)
	})
	team := plan("Team", func(slug string) { grant(t, slug, "scraped-pages", 200, 0) })
	enterprise := plan("Enterprise", func(slug string) {
		grant(t, slug, "firecrawl-credits", 1000, 0)
		grant(t, slug, "scraped-pages", -1, -1)
	})
	nothing := plan("Free", func(slug string) { grant(t, slug, "seats", 1, 0) })
	key := newPublishableKey(t, "https://www.example.com")

	catalog := commonfixture.AssertJSONResponse[getpubliccatalog.PublicCatalog](t,
		publicGet(t, testServer, "/api/public/catalog", key.Key, "https://www.example.com"), fiber.StatusOK)

	entitlementsOf := func(p planRef) map[string]getpubliccatalog.PublicPlanEntitlement {
		for _, candidate := range catalog.Plans {
			if candidate.LicenseSlug == p.slug {
				out := map[string]getpubliccatalog.PublicPlanEntitlement{}
				for _, e := range candidate.Entitlements {
					out[e.Slug] = e
				}
				return out
			}
		}
		t.Fatalf("plan %s is not in the catalogue", p.slug)
		return nil
	}

	t.Run("TheWeightedSumOfTheGrants", func(t *testing.T) {
		credits := entitlementsOf(pro)["credits"]

		assert.Equal(t, "NUMBER", credits.Type)
		assert.JSONEq(t, `1000`, string(credits.Value))
		assert.False(t, credits.Unlimited)
		assert.EqualValues(t, 0, *credits.LimitCapExceededOveragePercent)
		assert.Equal(t, "credit", *credits.UnitSingular)
		assert.EqualValues(t, 5, credits.DisplayOrder)
	})

	t.Run("OneGrantedSourceIsAGrantOfItsShare", func(t *testing.T) {
		assert.JSONEq(t, `120`, string(entitlementsOf(team)["credits"].Value), "0.6 x 200")
	})

	t.Run("AnUnlimitedSourceMakesItUnlimited", func(t *testing.T) {
		credits := entitlementsOf(enterprise)["credits"]

		assert.True(t, credits.Unlimited)
		assert.JSONEq(t, `-1`, string(credits.Value))
		assert.EqualValues(t, -1, *credits.LimitCapExceededOveragePercent)
	})

	t.Run("AVersionThatGrantsNoSourceDoesNotGrantIt", func(t *testing.T) {
		assert.NotContains(t, entitlementsOf(nothing), "credits")
	})

	t.Run("OnlyWhatIsUserFacingIsListed", func(t *testing.T) {
		for _, grants := range []map[string]getpubliccatalog.PublicPlanEntitlement{entitlementsOf(pro), entitlementsOf(team), entitlementsOf(enterprise)} {
			assert.NotContains(t, grants, "internal-total", "a combined entitlement that is not user facing is internal")
			assert.NotContains(t, grants, "firecrawl-credits", "so are its sources")
			assert.NotContains(t, grants, "scraped-pages")
		}
	})

	t.Run("ThePlansListStaysInTheCataloguesOrder", func(t *testing.T) {
		var slugs []string
		for _, p := range catalog.Plans {
			if p.LicenseSlug == pro.slug {
				for _, e := range p.Entitlements {
					slugs = append(slugs, e.Slug)
				}
			}
		}
		assert.Equal(t, []string{"seats", "credits"}, slugs, "seats at 0, credits at 5")
	})
}

// planRef names a plan of the catalogue by its licence version.
type planRef struct{ slug string }

// A combined entitlement is read, never granted: every route that would grant
// it, boost it, meter it or report on it says so, in a 422 that names the reason.
func TestCombinedEntitlement_IsNeverGrantedMeteredOrBoosted(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "firecrawl-credits", 0)
	newEntitlement(t, "scraped-pages", 0)
	newCombinedEntitlement(t, "credits", [][2]string{{"firecrawl-credits", "0.4"}, {"scraped-pages", "0.6"}})
	version := newVersion(t, "Pro", "PUBLISHED")
	addon := newAddon(t, map[string]any{"name": "Extra credits", "slug": "extra-credits"})

	refused := func(t *testing.T, method, path string, payload any, wantCode string) {
		t.Helper()
		assert.Equal(t, wantCode, problemCode(t, fiber.StatusUnprocessableEntity, method, path, payload))
	}

	t.Run("ALicenceGrant", func(t *testing.T) {
		refused(t, "POST", "/api/licenses/"+version.Slug+"/entitlements", map[string]any{
			"entitlementSlug": "credits", "value": map[string]any{"type": "number", "value": 1000},
		}, "AssociateEntitlementToLicense.EntitlementIsCombined")
	})

	t.Run("AnAddonGrant", func(t *testing.T) {
		refused(t, "POST", "/api/addons/"+addon.Slug+"/entitlements", map[string]any{
			"entitlementSlug": "credits", "value": map[string]any{"type": "number", "value": 500}, "overrideBehavior": "ADD",
		}, "AssignAddonEntitlement.EntitlementIsCombined")
	})

	t.Run("AMeteredLicencePrice", func(t *testing.T) {
		for _, model := range []string{"USAGE_BASED", "OVERAGE"} {
			refused(t, "POST", "/api/licenses/"+version.Slug+"/prices", metered(model, "credits", "0.5"), "CreateLicensePrice.EntitlementIsCombined")
		}
	})

	t.Run("AMeteredAddonPrice", func(t *testing.T) {
		refused(t, "POST", "/api/addons/"+addon.Slug+"/prices", metered("USAGE_BASED", "credits", "0.5"), "CreateAddonPrice.EntitlementIsCombined")
	})

	t.Run("AVoucherBoost", func(t *testing.T) {
		refused(t, "POST", "/api/vouchers", map[string]any{
			"name": "Boost", "voucherType": "ENTITLEMENT_BOOST", "duration": "FOREVER",
			"grants": []map[string]any{{"entitlementSlug": "credits", "modifierType": "MULTIPLY", "modifierValue": "3"}},
		}, "CreateVoucher.EntitlementIsCombined")
	})

	t.Run("ItsSourcesAreStillGrantedAndBoostedAsBefore", func(t *testing.T) {
		grant(t, version.Slug, "firecrawl-credits", 1000, 0)
		resp := call(t, "POST", "/api/addons/"+addon.Slug+"/entitlements", map[string]any{
			"entitlementSlug": "firecrawl-credits", "value": map[string]any{"type": "number", "value": 500}, "overrideBehavior": "ADD",
		})
		assert.Equal(t, fiber.StatusCreated, resp.StatusCode)
	})
}

// An add-on or a boost acts on a source, and the sum follows: the combined
// entitlement has no limit of its own to raise.
func TestCombinedEntitlement_FollowsTheAddonsAndBoostsOfItsSources(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "firecrawl-credits", 0)
	newEntitlement(t, "scraped-pages", 0)
	newCombinedEntitlement(t, "credits", [][2]string{{"firecrawl-credits", "0.4"}, {"scraped-pages", "0.6"}})
	s := newSold(t, flatFee("2900", "MONTHLY"))
	grant(t, s.version.Slug, "firecrawl-credits", 1000, 0)
	grant(t, s.version.Slug, "scraped-pages", 1000, 0)
	appendUsage(t, s.instance.Slug, "firecrawl-credits", 300)
	appendUsage(t, s.instance.Slug, "scraped-pages", 100)
	require.InDelta(t, 1000, usageOf(t, s.instance.Slug)["credits"].Limit.Number.Value, 1e-9)

	addon := newAddon(t, map[string]any{"name": "Extra crawling", "slug": "extra-crawling"})
	addonGrant(t, addon.Slug, "firecrawl-credits", 500, "ADD")
	addonPrice(t, addon.Slug, defaultFlatFee("900", "MONTHLY"))
	resp := call(t, "PUT", "/api/addons/"+addon.Slug+"/compatible-license-families/"+familyOf(t, s.version.ID), nil)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	attach(t, s.instance.Slug, addon.Slug, 2)

	credits := usageOf(t, s.instance.Slug)["credits"]
	assert.InDelta(t, 1400, credits.Limit.Number.Value, 1e-9, "0.4 x (1000 + 2 x 500) + 0.6 x 1000")
	assert.InDelta(t, 180, credits.Value.Number.Value, 1e-9)

	boost := newVoucher(t, map[string]any{
		"voucherType": "ENTITLEMENT_BOOST", "duration": "FOREVER",
		"grants": []map[string]any{{"entitlementSlug": "scraped-pages", "modifierType": "MULTIPLY", "modifierValue": "3"}},
	})
	publish(t, boost)
	redeem(t, s.instance.Slug, *boost.Code)

	credits = usageOf(t, s.instance.Slug)["credits"]
	assert.InDelta(t, 0.4*2000+0.6*3000, credits.Limit.Number.Value, 1e-9, "the boost multiplies the source, the sum follows")
}

func familyOf(t *testing.T, licenseID any) string {
	t.Helper()
	var slug string
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT lf.slug FROM "license" l JOIN license_family lf ON lf.id = l.family_id WHERE l.id = $1`, licenseID).Scan(&slug))
	return slug
}

// A catalogue shows what it would show of a source on its own: a credit pool
// is not there while AI is off, so the sum of a plan's grants is the sum of the
// others.
func TestPublicCatalog_ACombinedEntitlementDoesNotSumACreditPoolWhileAIIsOff(t *testing.T) {
	aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformFlags: aitest.Flags(true),
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval = -1
			cfg.Billing.Push.Interval = -1
		},
		ConnectorEntitlements: entitlements,
	})
	t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	post := func(path string, payload any, status int) {
		t.Helper()
		require.Equal(t, status, callOn(t, aiServer, "POST", path, payload).StatusCode)
	}
	post("/api/entitlements", map[string]any{"name": "Firecrawl", "slug": "firecrawl-credits", "description": "d", "type": "NUMBER", "aggregationMethod": "SUM"}, fiber.StatusCreated)
	post("/api/entitlements", map[string]any{"name": "AI", "slug": "ai-credits", "description": "d", "type": "NUMBER_AI_CREDIT", "aggregationMethod": "SUM"}, fiber.StatusCreated)
	post("/api/entitlements", map[string]any{
		"name": "Credits", "slug": "credits", "description": "d", "type": "NUMBER", "usageSource": "COMBINED_USAGE", "userFacing": true,
		"sources": []map[string]string{{"entitlementSlug": "firecrawl-credits", "weight": "0.4"}, {"entitlementSlug": "ai-credits", "weight": "0.6"}},
	}, fiber.StatusCreated)
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
	for _, slug := range []string{"firecrawl-credits", "ai-credits"} {
		post("/api/licenses/"+pro.Slug+"/entitlements", map[string]any{
			"entitlementSlug": slug, "value": map[string]any{"type": "number", "value": 1000}, "limitCapExceededOveragePercent": 0,
		}, fiber.StatusNoContent)
	}
	key := newPublishableKey(t, "https://www.example.com")
	creditsOf := func(server *tests.TestServer) string {
		t.Helper()
		catalog := commonfixture.AssertJSONResponse[getpubliccatalog.PublicCatalog](t,
			publicGet(t, server, "/api/public/catalog", key.Key, "https://www.example.com"), fiber.StatusOK)
		require.Len(t, catalog.Plans, 1)
		for _, e := range catalog.Plans[0].Entitlements {
			if e.Slug == "credits" {
				return string(e.Value)
			}
		}
		return "absent"
	}

	assert.Equal(t, "1000", creditsOf(aiServer), "AI is on: both are summed, 0.4 x 1000 + 0.6 x 1000")
	assert.Equal(t, "400", creditsOf(testServer), "AI is off: the pool is not shown, and counts as not granted")
}
