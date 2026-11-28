package graphql_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func createCombinedThroughREST(t *testing.T, slug string, sources ...entitlementsschema.EntitlementSource) {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/entitlements", entitlementsschema.Entitlement{
		Name: slug, Slug: slug, Type: ptr.To(entitlementsschema.Number), UsageSource: ptr.To(entitlementsschema.CombinedUsage), Sources: sources,
	})
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusCreated, resp.StatusCode)
}

// The definition says where its usage comes from and what it sums; an instance
// reads the sum, as REST answers it.
func TestGraphQL_CombinedEntitlement(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	customer := newCustomer(t, "GQL Combined Co")
	license := newLicense(t, "GQL Combined Plan")
	first := newPresentedEntitlement(t, "gql-firecrawl-credits", 10)
	second := newPresentedEntitlement(t, "gql-scraped-pages", 20)
	associateNumberEntitlement(t, license.Slug, first.Slug, 1000)
	associateNumberEntitlement(t, license.Slug, second.Slug, 1000)
	createCombinedThroughREST(t, "gql-credits",
		entitlementsschema.EntitlementSource{EntitlementSlug: first.Slug, Weight: "0.4"},
		entitlementsschema.EntitlementSource{EntitlementSlug: second.Slug, Weight: "0.6"})
	instance := newInstance(t, "gql-combined-instance", customer, license)
	reportUsage(t, instance.ID, first.ID, 300, 3)
	reportUsage(t, instance.ID, second.ID, 100, 2)

	t.Run("TheDefinitionCarriesItsUsageSourceAndSources", func(t *testing.T) {
		resp := executeGraphQL(t, `
			query {
				entitlements(limit: 100) {
					items { slug usageSource sources { entitlementSlug weight } }
				}
			}`, nil)
		require.Empty(t, resp.Errors)

		var data struct {
			Entitlements struct {
				Items []struct {
					Slug        string  `json:"slug"`
					UsageSource *string `json:"usageSource"`
					Sources     []struct {
						EntitlementSlug string `json:"entitlementSlug"`
						Weight          string `json:"weight"`
					} `json:"sources"`
				} `json:"items"`
			} `json:"entitlements"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		bySlug := map[string]int{}
		for i, item := range data.Entitlements.Items {
			bySlug[item.Slug] = i
		}
		combined := data.Entitlements.Items[bySlug["gql-credits"]]
		require.NotNil(t, combined.UsageSource)
		assert.Equal(t, "COMBINED_USAGE", *combined.UsageSource)
		require.Len(t, combined.Sources, 2)
		assert.Equal(t, "gql-firecrawl-credits", combined.Sources[0].EntitlementSlug)
		assert.Equal(t, "0.4", combined.Sources[0].Weight)
		assert.Equal(t, "0.6", combined.Sources[1].Weight)

		calculated := data.Entitlements.Items[bySlug["gql-firecrawl-credits"]]
		require.NotNil(t, calculated.UsageSource)
		assert.Equal(t, "CALCULATED_USAGE", *calculated.UsageSource)
		assert.Empty(t, calculated.Sources)
	})

	// A licence grants calculated entitlements only: the entitlement a grant names
	// is read through the loader by slug, which reads the usage source too.
	t.Run("TheEntitlementOfALicenseGrantIsCalculated", func(t *testing.T) {
		resp := executeGraphQL(t, `
			query($slug: String!) {
				license(slug: $slug) { entitlements { entitlement { slug usageSource sources { entitlementSlug } } } }
			}`, map[string]any{"slug": license.Slug})
		require.Empty(t, resp.Errors)

		var data struct {
			License struct {
				Entitlements []struct {
					Entitlement struct {
						UsageSource string   `json:"usageSource"`
						Sources     []string `json:"sources"`
					} `json:"entitlement"`
				} `json:"entitlements"`
			} `json:"license"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		require.Len(t, data.License.Entitlements, 2)
		for _, grant := range data.License.Entitlements {
			assert.Equal(t, "CALCULATED_USAGE", grant.Entitlement.UsageSource)
			assert.Empty(t, grant.Entitlement.Sources)
		}
	})

	t.Run("TheInstanceReadsTheSumWithTheDetail", func(t *testing.T) {
		resp := executeGraphQL(t, `
			query($slug: String!) {
				instance(slug: $slug) {
					entitlementUsage {
						entitlementSlug
						value
						limit
						source
						limitCapExceededOveragePercent
						sources { entitlementSlug weight usage limit }
					}
				}
			}`, map[string]any{"slug": instance.Slug})
		require.Empty(t, resp.Errors)

		var data struct {
			Instance struct {
				EntitlementUsage []struct {
					EntitlementSlug                string         `json:"entitlementSlug"`
					Value                          map[string]any `json:"value"`
					Limit                          map[string]any `json:"limit"`
					Source                         string         `json:"source"`
					LimitCapExceededOveragePercent *int           `json:"limitCapExceededOveragePercent"`
					Sources                        []struct {
						EntitlementSlug string  `json:"entitlementSlug"`
						Weight          string  `json:"weight"`
						Usage           float64 `json:"usage"`
						Limit           float64 `json:"limit"`
					} `json:"sources"`
				} `json:"entitlementUsage"`
			} `json:"instance"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		require.Len(t, data.Instance.EntitlementUsage, 3, "the two it grants, and the sum")

		credits := data.Instance.EntitlementUsage[2]
		assert.Equal(t, "gql-credits", credits.EntitlementSlug)
		assert.EqualValues(t, 180, credits.Value["value"])
		assert.EqualValues(t, 5, credits.Value["event_count"])
		assert.EqualValues(t, 1000, credits.Limit["value"])
		assert.Equal(t, "license", credits.Source)
		require.NotNil(t, credits.LimitCapExceededOveragePercent)
		assert.Zero(t, *credits.LimitCapExceededOveragePercent)
		require.Len(t, credits.Sources, 2)
		assert.Equal(t, "gql-firecrawl-credits", credits.Sources[0].EntitlementSlug)
		assert.InDelta(t, 300, credits.Sources[0].Usage, 0)
		assert.InDelta(t, 1000, credits.Sources[0].Limit, 0)
		assert.Empty(t, data.Instance.EntitlementUsage[0].Sources, "only a combined entitlement has a detail")
	})

	t.Run("TheSameAsRESTAnswers", func(t *testing.T) {
		resp, err := testServer.App.Test(httptest.NewRequest("GET", "/api/instances/"+instance.Slug+"/entitlements/usage", nil), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		rest := commonfixture.AssertJSONResponse[[]struct {
			EntitlementSlug string `json:"entitlementSlug"`
			Value           struct {
				Value float64 `json:"value"`
			} `json:"value"`
		}](t, resp, fiber.StatusOK)

		require.Len(t, rest, 3)
		assert.Equal(t, "gql-credits", rest[2].EntitlementSlug)
		assert.InDelta(t, 180, rest[2].Value.Value, 0)
	})
}
