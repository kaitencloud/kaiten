package graphql_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const licenseAddonGrantsDocument = `{
	licenses(limit: 50) {
		items {
			slug
			addonGrants {
				entitlementSlug entitlementType addonId addonSlug addonFamilySlug addonName addonVersion
				lifecycleState isDefault maxQuantity value unlimited limitCapExceededOveragePercent overrideBehavior
			}
			pool: addonGrants(entitlementSlug: "ai-credits") { addonSlug }
		}
	}
}`

const ruleGrantSourcesDocument = `{ licenses(limit: 50) { items { slug conversionRules { grantedByLicense grantedByAddons } } } }`

type licenseAddonGrant struct {
	EntitlementSlug                string         `json:"entitlementSlug"`
	EntitlementType                string         `json:"entitlementType"`
	AddonID                        string         `json:"addonId"`
	AddonSlug                      string         `json:"addonSlug"`
	AddonFamilySlug                string         `json:"addonFamilySlug"`
	AddonName                      string         `json:"addonName"`
	AddonVersion                   int            `json:"addonVersion"`
	LifecycleState                 string         `json:"lifecycleState"`
	IsDefault                      bool           `json:"isDefault"`
	MaxQuantity                    *int           `json:"maxQuantity"`
	Value                          map[string]any `json:"value"`
	Unlimited                      bool           `json:"unlimited"`
	LimitCapExceededOveragePercent *int           `json:"limitCapExceededOveragePercent"`
	OverrideBehavior               string         `json:"overrideBehavior"`
}

type licenseGrantSources struct {
	Slug        string              `json:"slug"`
	AddonGrants []licenseAddonGrant `json:"addonGrants"`
	Pool        []struct {
		AddonSlug string `json:"addonSlug"`
	} `json:"pool"`
	ConversionRules []struct {
		GrantedByLicense bool `json:"grantedByLicense"`
		GrantedByAddons  bool `json:"grantedByAddons"`
	} `json:"conversionRules"`
}

func grantSourcesOf(t *testing.T, server *tests.TestServer, document string) map[string]licenseGrantSources {
	t.Helper()

	var data struct {
		Licenses struct {
			Items []licenseGrantSources `json:"items"`
		} `json:"licenses"`
	}
	sendGraphQL(t, server, document, nil).decodeData(t, &data)
	bySlug := make(map[string]licenseGrantSources, len(data.Licenses.Items))
	for _, item := range data.Licenses.Items {
		bySlug[item.Slug] = item
	}
	return bySlug
}

// aiBillingServer has billing and AI usage on: an add-on that grants a credit
// pool needs both.
func aiBillingServer(t *testing.T, ai bool, scopes ...string) *tests.TestServer {
	t.Helper()

	server := tests.NewTestServer(testDb, tests.TestServerOptions{
		Scopes: scopes, PlatformFlags: aitest.Flags(ai),
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval = -1
		},
	})
	t.Cleanup(func() { require.NoError(t, server.Close()) })
	return server
}

// TestGraphQL_LicenseAddonGrants is how a licence version comes to grant a
// pool it does not grant itself: an add-on version that declares the licence's
// family compatible carries the pool. License.addonGrants lists those grants,
// and a conversion rule says whether one exists for its pool.
func TestGraphQL_LicenseAddonGrants(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	server := aiBillingServer(t, true)
	organization := testDb.DefaultData.OrganizationID
	db := testServer.Dependencies.DB

	sold[map[string]any](t, server, http.MethodPost, "/api/entitlements", map[string]any{
		"name": "seats", "slug": "seats", "description": "seats", "type": "NUMBER",
		"aggregationMethod": "SUM", "unitSingular": "seat", "unitPlural": "seats",
	}, fiber.StatusCreated)
	_, err := db.Exec(t.Context(), `INSERT INTO entitlement (organization_id,name,slug,type,aggregation_method) VALUES ($1,'AI credits','ai-credits','NUMBER_AI_CREDIT','SUM')`, organization)
	require.NoError(t, err)

	pro := newSoldLicense(t, server, "Pro")
	proNext := sold[licenseschema.License](t, server, http.MethodPost, "/api/licenses", map[string]any{
		"name": "Pro", "description": "d", "type": "PAID", "isDefault": false, "lifecycleState": "PUBLISHED", "familySlug": pro.Slug,
	}, fiber.StatusCreated)
	require.Equal(t, pro.FamilyID, proNext.FamilyID)
	bare := newSoldLicense(t, server, "Bare")

	pack := newSoldAddon(t, server, "Credit pack")
	sold[map[string]any](t, server, http.MethodPost, "/api/addons/"+pack.Slug+"/entitlements", map[string]any{
		"entitlementSlug": "ai-credits", "value": map[string]any{"type": "number", "value": 500}, "overrideBehavior": "ADD",
	}, fiber.StatusCreated)
	sold[map[string]any](t, server, http.MethodPost, "/api/addons/"+pack.Slug+"/entitlements", map[string]any{
		"entitlementSlug": "seats", "value": map[string]any{"type": "number", "value": 5}, "limitCapExceededOveragePercent": 10,
	}, fiber.StatusCreated)
	// An add-on that fits no licence family grants nothing anywhere.
	loose := newSoldAddon(t, server, "Loose pack")
	sold[map[string]any](t, server, http.MethodPost, "/api/addons/"+loose.Slug+"/entitlements", map[string]any{
		"entitlementSlug": "ai-credits", "value": map[string]any{"type": "number", "value": 1},
	}, fiber.StatusCreated)

	// A rule on each licence prices the pool no licence grants.
	for _, license := range []licenseschema.License{proNext, bare} {
		_, err = db.Exec(t.Context(), `
			INSERT INTO credit_conversion_rule (organization_id, license_id, entitlement_id, rate_per_request, created_by_id, updated_by_id)
			SELECT $1, $2, e.id, 0.25, $3, $3 FROM entitlement e WHERE e.organization_id = $1 AND e.slug = 'ai-credits'`,
			organization, license.ID, testDb.DefaultData.UserID)
		require.NoError(t, err)
	}

	t.Run("NothingBeforeTheAddonFitsTheFamily", func(t *testing.T) {
		licenses := grantSourcesOf(t, server, licenseAddonGrantsDocument)
		for _, slug := range []string{pro.Slug, proNext.Slug, bare.Slug} {
			require.NotNil(t, licenses[slug].AddonGrants)
			assert.Empty(t, licenses[slug].AddonGrants, slug)
		}
		rules := grantSourcesOf(t, server, ruleGrantSourcesDocument)
		require.Len(t, rules[proNext.Slug].ConversionRules, 1)
		assert.False(t, rules[proNext.Slug].ConversionRules[0].GrantedByAddons)
	})

	response, err := server.App.Test(commonfixture.NewJSONRequest(t, http.MethodPut, "/api/addons/"+pack.Slug+"/compatible-license-families/"+pro.Slug, nil), fiber.TestConfig{})
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, response.StatusCode)

	t.Run("EveryVersionOfTheFamilyListsTheGrants", func(t *testing.T) {
		licenses := grantSourcesOf(t, server, licenseAddonGrantsDocument)
		for _, slug := range []string{pro.Slug, proNext.Slug} {
			grants := licenses[slug].AddonGrants
			require.Len(t, grants, 2, slug)
			credits, seats := grants[0], grants[1]
			assert.Equal(t, "ai-credits", credits.EntitlementSlug, "ordered by entitlement")
			assert.Equal(t, "NUMBER_AI_CREDIT", credits.EntitlementType)
			assert.Equal(t, pack.ID.String(), credits.AddonID)
			assert.Equal(t, pack.Slug, credits.AddonSlug)
			assert.Equal(t, pack.FamilySlug, credits.AddonFamilySlug)
			assert.Equal(t, "Credit pack", credits.AddonName)
			assert.Equal(t, 1, credits.AddonVersion)
			assert.Equal(t, pack.LifecycleState, credits.LifecycleState)
			assert.Equal(t, pack.IsDefault, credits.IsDefault)
			assert.Nil(t, credits.MaxQuantity)
			assert.Equal(t, map[string]any{"type": "number", "value": float64(500)}, credits.Value)
			assert.False(t, credits.Unlimited)
			assert.Nil(t, credits.LimitCapExceededOveragePercent, "inherits the licence grant's")
			assert.Equal(t, "ADD", credits.OverrideBehavior)

			assert.Equal(t, "seats", seats.EntitlementSlug)
			assert.Equal(t, "MAX", seats.OverrideBehavior, "the default")
			require.NotNil(t, seats.LimitCapExceededOveragePercent)
			assert.Equal(t, 10, *seats.LimitCapExceededOveragePercent)

			require.Len(t, licenses[slug].Pool, 1, "narrowed to one entitlement")
			assert.Equal(t, pack.Slug, licenses[slug].Pool[0].AddonSlug)
		}
		assert.Empty(t, licenses[bare.Slug].AddonGrants, "another family")
		assert.Empty(t, licenses[bare.Slug].Pool)
	})

	t.Run("ARuleSaysWhetherAnAddonGrantsItsPool", func(t *testing.T) {
		rules := grantSourcesOf(t, server, ruleGrantSourcesDocument)
		require.Len(t, rules[proNext.Slug].ConversionRules, 1)
		assert.False(t, rules[proNext.Slug].ConversionRules[0].GrantedByLicense, "its meaning does not change")
		assert.True(t, rules[proNext.Slug].ConversionRules[0].GrantedByAddons)
		require.Len(t, rules[bare.Slug].ConversionRules, 1)
		assert.False(t, rules[bare.Slug].ConversionRules[0].GrantedByAddons)

		// REST says the same, and needs neither billing nor read:addons.
		aiOnly := tests.NewTestServer(testDb, tests.TestServerOptions{
			Scopes: []string{scope.Read(scope.Licenses)}, PlatformFlags: aitest.Flags(true),
		})
		t.Cleanup(func() { require.NoError(t, aiOnly.Close()) })
		listed := sold[[]licenseschema.ConversionRule](t, aiOnly, http.MethodGet, "/api/licenses/"+proNext.Slug+"/conversion-rules", nil, fiber.StatusOK)
		require.Len(t, listed, 1)
		assert.True(t, listed[0].GrantedByAddons)
		assert.False(t, listed[0].GrantedByLicense)
		assert.True(t, grantSourcesOf(t, aiOnly, ruleGrantSourcesDocument)[proNext.Slug].ConversionRules[0].GrantedByAddons)
	})

	t.Run("AnArchivedVersionStillGrants", func(t *testing.T) {
		_, err := db.Exec(t.Context(), `UPDATE addon SET lifecycle_state = 'ARCHIVED', is_default = false WHERE id = $1 AND organization_id = $2`, pack.ID, organization)
		require.NoError(t, err)
		grants := grantSourcesOf(t, server, licenseAddonGrantsDocument)[proNext.Slug].AddonGrants
		require.Len(t, grants, 2)
		assert.Equal(t, "ARCHIVED", grants[0].LifecycleState)
		assert.True(t, grantSourcesOf(t, server, ruleGrantSourcesDocument)[proNext.Slug].ConversionRules[0].GrantedByAddons)
	})

	t.Run("ACreditPoolIsLeftOutWhileAIUsageIsOff", func(t *testing.T) {
		grants := grantSourcesOf(t, aiBillingServer(t, false), licenseAddonGrantsDocument)[proNext.Slug].AddonGrants
		require.Len(t, grants, 1)
		assert.Equal(t, "seats", grants[0].EntitlementSlug)
	})

	t.Run("IsRefusedWhereBillingIsOff", func(t *testing.T) {
		aiOnly := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, aiOnly.Close()) })
		answer := sendGraphQL(t, aiOnly, licenseAddonGrantsDocument, nil)
		require.Equal(t, http.StatusOK, answer.status, string(answer.body))
		var envelope graphQLResponse
		require.NoError(t, json.Unmarshal(answer.body, &envelope))
		require.NotEmpty(t, envelope.Errors, string(answer.body))
		assert.Equal(t, "Billing.Disabled", envelope.Errors[0].Extensions["code"])
		assert.NotContains(t, string(answer.body), pack.Slug)
	})

	t.Run("NeedsTheAddonCatalogueScope", func(t *testing.T) {
		licensesOnly := aiBillingServer(t, true, scope.Read(scope.Licenses))
		sendGraphQL(t, licensesOnly, licenseAddonGrantsDocument, nil).requireMissingScope(t, scope.Read(scope.Addons))
	})

	t.Run("AnotherOrganizationReadsNothingOfIt", func(t *testing.T) {
		neighbour := uuid.New()
		_, err := db.Exec(t.Context(), `INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Neighbour')`, neighbour, "neighbour-"+neighbour.String())
		require.NoError(t, err)
		_, err = db.Exec(t.Context(), `INSERT INTO user_on_organization (organization_id, user_id) VALUES ($1, $2)`, neighbour, testDb.DefaultData.UserID)
		require.NoError(t, err)
		_, err = db.Exec(t.Context(), `INSERT INTO license_family (organization_id, slug) VALUES ($1, 'neighbour')`, neighbour)
		require.NoError(t, err)
		_, err = db.Exec(t.Context(), `
			INSERT INTO license (organization_id, family_id, name, slug, description, type, lifecycle_state)
			SELECT $1, id, 'Neighbour', 'neighbour', '', 'PAID', 'PUBLISHED' FROM license_family WHERE organization_id = $1 AND slug = 'neighbour'`, neighbour)
		require.NoError(t, err)
		other := tests.NewTestServer(testDb, tests.TestServerOptions{
			OrganizationID: &neighbour, PlatformFlags: aitest.Flags(true),
			ConfigOverride: func(cfg *config.Config) {
				cfg.Billing.Enabled = true
				cfg.Billing.PeriodClose.Interval = -1
			},
		})
		t.Cleanup(func() { require.NoError(t, other.Close()) })
		licenses := grantSourcesOf(t, other, licenseAddonGrantsDocument)
		require.Len(t, licenses, 1)
		assert.Empty(t, licenses["neighbour"].AddonGrants)
	})
}
