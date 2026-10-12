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
	addonscatalogue "github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// catalogPricesDocument is the document the console's price picker of a voucher sends
// (app/src/domains/billing/queries/catalog-prices.queries.ts), as the console writes it:
// every license version and every add-on version, each with all its prices, in one
// request. The unit tests of this module keep the copy in step with the console's.
const catalogPricesDocument = `query GetCatalogPrices($limit: Int, $licensesCursor: String, $addonsCursor: String, $withLicenses: Boolean!, $withAddons: Boolean!) {
	licenses(limit: $limit, cursor: $licensesCursor) @include(if: $withLicenses) {
		nextCursor hasMore
		items {
			id name version lifecycleState
			prices {
				id billingModel billingTiming billingPeriod currency unitAmountDecimal
				meteredEntitlement saleUnitFactor displayLabel displayOrder isDefault status
			}
		}
	}
	addons(limit: $limit, cursor: $addonsCursor) @include(if: $withAddons) {
		nextCursor hasMore
		items {
			id name versionName lifecycleState
			prices {
				id billingModel billingTiming billingPeriod currency unitAmountDecimal
				meteredEntitlement saleUnitFactor displayLabel displayOrder isDefault status
			}
		}
	}
}`

// newBillingServer is a server that has billing on, for the organization the tests
// work in unless one is named: the add-ons and the prices exist only behind that gate.
func newBillingServer(t *testing.T, organizationID *uuid.UUID, scopes ...string) *tests.TestServer {
	t.Helper()

	server := tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID: organizationID,
		Scopes:         scopes,
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			// The tests close no period, and the job would race them.
			cfg.Billing.PeriodClose.Interval = -1
		},
	})
	t.Cleanup(func() { require.NoError(t, server.Close()) })

	return server
}

// sold calls REST on server and decodes the answer, which must have the status wanted.
func sold[T any](t *testing.T, server *tests.TestServer, method, path string, body any, want int) T {
	t.Helper()

	response, err := server.App.Test(commonfixture.NewJSONRequest(t, method, path, body), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	return commonfixture.AssertJSONResponse[T](t, response, want)
}

func newSoldLicense(t *testing.T, server *tests.TestServer, name string) licenseschema.License {
	t.Helper()

	return sold[licenseschema.License](t, server, http.MethodPost, "/api/licenses", map[string]any{
		"name": name, "description": "d", "type": "PAID", "isDefault": false, "lifecycleState": "PUBLISHED",
	}, fiber.StatusCreated)
}

func newSoldAddon(t *testing.T, server *tests.TestServer, name string) addonscatalogue.Addon {
	t.Helper()

	return sold[addonscatalogue.Addon](t, server, http.MethodPost, "/api/addons", map[string]any{
		"name": name, "description": "per unit", "pricingType": "PAID",
	}, fiber.StatusCreated)
}

func flatFee(amount, period string) map[string]any {
	return map[string]any{"billingModel": "FLAT_FEE", "billingPeriod": period, "currency": "EUR", "unitAmountDecimal": amount}
}

func priceOf(t *testing.T, server *tests.TestServer, kind, slug string, payload map[string]any) prices.Price {
	t.Helper()

	return sold[prices.Price](t, server, http.MethodPost, "/api/"+kind+"/"+slug+"/prices", payload, fiber.StatusCreated)
}

func deprecate(t *testing.T, server *tests.TestServer, kind, slug string, price prices.Price) {
	t.Helper()

	retired := sold[prices.Price](t, server, http.MethodPost,
		"/api/"+kind+"/"+slug+"/prices/"+price.ID.String()+"/deprecate", nil, fiber.StatusOK)
	require.Equal(t, prices.StatusDeprecated, retired.Status)
}

// catalogPrice is a price as the document selects it.
type catalogPrice struct {
	ID                 string  `json:"id"`
	BillingModel       string  `json:"billingModel"`
	BillingTiming      string  `json:"billingTiming"`
	BillingPeriod      *string `json:"billingPeriod"`
	Currency           string  `json:"currency"`
	UnitAmountDecimal  string  `json:"unitAmountDecimal"`
	MeteredEntitlement *string `json:"meteredEntitlement"`
	SaleUnitFactor     *string `json:"saleUnitFactor"`
	DisplayLabel       *string `json:"displayLabel"`
	DisplayOrder       int     `json:"displayOrder"`
	IsDefault          bool    `json:"isDefault"`
	Status             string  `json:"status"`
}

// catalogVersion is a license version or an add-on version, whichever members of the
// two the list that holds it selects.
type catalogVersion struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Version        string         `json:"version"`
	VersionName    string         `json:"versionName"`
	LifecycleState string         `json:"lifecycleState"`
	Prices         []catalogPrice `json:"prices"`
}

// catalogPage is what the document answers for one of its lists.
type catalogPage struct {
	Items      []catalogVersion `json:"items"`
	NextCursor *string          `json:"nextCursor"`
	HasMore    bool             `json:"hasMore"`
}

type catalogData struct {
	Licenses *catalogPage `json:"licenses"`
	Addons   *catalogPage `json:"addons"`
}

func catalogOf(t *testing.T, server *tests.TestServer, variables map[string]any) catalogData {
	t.Helper()

	var data catalogData
	sendGraphQL(t, server, catalogPricesDocument, variables).decodeData(t, &data)

	return data
}

func both() map[string]any {
	return map[string]any{"limit": 200, "withLicenses": true, "withAddons": true}
}

// TestGraphQL_CatalogPrices is what the price picker of a voucher reads: every license
// version and every add-on version of the organization with all its prices, in one
// document, where REST takes a request for each version's prices.
func TestGraphQL_CatalogPrices(t *testing.T) {
	t.Run("ReadsEveryVersionOfBothListsWithAllTheirPrices", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		server := newBillingServer(t, nil)

		// A license version with three prices, one of them retired and one metered; one
		// with none; an add-on with a price retired and one on sale; one with none.
		sold[map[string]any](t, server, http.MethodPost, "/api/entitlements", map[string]any{
			"name": "tokens", "slug": "tokens", "description": "tokens", "type": "NUMBER",
			"aggregationMethod": "SUM", "resetPeriod": "MONTH", "unitSingular": "token", "unitPlural": "tokens",
			"saleUnitFactor": 10000, "saleUnitSingular": "10k tokens", "saleUnitPlural": "10k tokens",
		}, fiber.StatusCreated)
		pro := newSoldLicense(t, server, "Pro")
		bare := newSoldLicense(t, server, "Bare")
		resp, err := server.App.Test(commonfixture.NewJSONRequest(t, http.MethodPost, "/api/licenses/"+pro.Slug+"/entitlements", map[string]any{
			"entitlementSlug": "tokens", "value": map[string]any{"type": "number", "value": 100},
			"limitCapExceededOveragePercent": 0,
		}), fiber.TestConfig{})
		require.NoError(t, err)
		require.Less(t, resp.StatusCode, 300)

		monthly := flatFee("2900", "MONTHLY")
		monthly["isDefault"] = true
		monthly["displayLabel"] = "Pro, monthly"
		proMonthly := priceOf(t, server, "licenses", pro.Slug, monthly)
		proAnnual := priceOf(t, server, "licenses", pro.Slug, flatFee("29000", "ANNUAL"))
		deprecate(t, server, "licenses", pro.Slug, proAnnual)
		proTokens := priceOf(t, server, "licenses", pro.Slug, map[string]any{
			"billingModel": "USAGE_BASED", "currency": "EUR", "unitAmountDecimal": "15", "meteredEntitlementSlug": "tokens",
		})

		seats := newSoldAddon(t, server, "Extra seats")
		storage := newSoldAddon(t, server, "Extra storage")
		seatsMonthly := flatFee("900", "MONTHLY")
		seatsMonthly["isDefault"] = true
		seatsMonth := priceOf(t, server, "addons", seats.Slug, seatsMonthly)
		seatsYear := priceOf(t, server, "addons", seats.Slug, flatFee("9000", "ANNUAL"))
		deprecate(t, server, "addons", seats.Slug, seatsYear)

		data := catalogOf(t, server, both())

		require.NotNil(t, data.Licenses)
		require.NotNil(t, data.Addons)
		assert.False(t, data.Licenses.HasMore)
		assert.False(t, data.Addons.HasMore)
		assert.Nil(t, data.Licenses.NextCursor)
		assert.Nil(t, data.Addons.NextCursor)

		licenses := map[string]int{}
		for i, item := range data.Licenses.Items {
			licenses[item.ID] = i
		}
		require.Len(t, data.Licenses.Items, 2)
		proItem := data.Licenses.Items[licenses[pro.ID.String()]]
		assert.Equal(t, "Pro", proItem.Name)
		assert.Equal(t, "PUBLISHED", proItem.LifecycleState)
		require.Len(t, proItem.Prices, 3, "the retired price is read too: a subscription may still be billed by it")
		byID := map[string]int{}
		for i, price := range proItem.Prices {
			byID[price.ID] = i
		}
		assert.Equal(t, "ACTIVE", proItem.Prices[byID[proMonthly.ID.String()]].Status)
		assert.Equal(t, "Pro, monthly", *proItem.Prices[byID[proMonthly.ID.String()]].DisplayLabel)
		assert.Equal(t, "DEPRECATED", proItem.Prices[byID[proAnnual.ID.String()]].Status)
		metered := proItem.Prices[byID[proTokens.ID.String()]]
		assert.Equal(t, "USAGE_BASED", metered.BillingModel)
		assert.Equal(t, "ARREARS", metered.BillingTiming)
		require.NotNil(t, metered.MeteredEntitlement)
		assert.Equal(t, "tokens", *metered.MeteredEntitlement)
		require.NotNil(t, metered.SaleUnitFactor)
		assert.Equal(t, "10000", *metered.SaleUnitFactor)
		assert.Nil(t, metered.BillingPeriod)
		bareItem := data.Licenses.Items[licenses[bare.ID.String()]]
		assert.NotNil(t, bareItem.Prices, "a version nobody priced has an empty list, not a missing one")
		assert.Empty(t, bareItem.Prices)

		addons := map[string]int{}
		for i, item := range data.Addons.Items {
			addons[item.ID] = i
		}
		require.Len(t, data.Addons.Items, 2)
		seatsItem := data.Addons.Items[addons[seats.ID.String()]]
		assert.Equal(t, "Extra seats", seatsItem.Name)
		assert.Equal(t, seats.VersionName, seatsItem.VersionName)
		assert.Equal(t, seats.LifecycleState, seatsItem.LifecycleState, "the state REST gives the version")
		require.Len(t, seatsItem.Prices, 2)
		seatsByID := map[string]int{}
		for i, price := range seatsItem.Prices {
			seatsByID[price.ID] = i
		}
		assert.True(t, seatsItem.Prices[seatsByID[seatsMonth.ID.String()]].IsDefault)
		assert.Equal(t, "ACTIVE", seatsItem.Prices[seatsByID[seatsMonth.ID.String()]].Status)
		assert.Equal(t, "DEPRECATED", seatsItem.Prices[seatsByID[seatsYear.ID.String()]].Status)
		storageItem := data.Addons.Items[addons[storage.ID.String()]]
		assert.NotNil(t, storageItem.Prices)
		assert.Empty(t, storageItem.Prices)
	})

	t.Run("ListsThePricesOfAVersionInTheOrderRESTDoes", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		server := newBillingServer(t, nil)
		pro := newSoldLicense(t, server, "Pro")
		priceOf(t, server, "licenses", pro.Slug, flatFee("2900", "MONTHLY"))
		retired := priceOf(t, server, "licenses", pro.Slug, flatFee("29000", "ANNUAL"))
		deprecate(t, server, "licenses", pro.Slug, retired)
		seats := newSoldAddon(t, server, "Extra seats")
		priceOf(t, server, "addons", seats.Slug, flatFee("900", "MONTHLY"))
		seatsYear := priceOf(t, server, "addons", seats.Slug, flatFee("9000", "ANNUAL"))
		deprecate(t, server, "addons", seats.Slug, seatsYear)

		data := catalogOf(t, server, both())

		// The GraphQL prices of a version are the REST ones, in the same order.
		for _, tc := range []struct {
			kind, slug string
			graphql    []string
		}{
			{kind: "licenses", slug: pro.Slug, graphql: pricesIDs(data.Licenses.Items[0].Prices)},
			{kind: "addons", slug: seats.Slug, graphql: pricesIDs(data.Addons.Items[0].Prices)},
		} {
			rest := sold[[]prices.Price](t, server, http.MethodGet, "/api/"+tc.kind+"/"+tc.slug+"/prices", nil, fiber.StatusOK)
			var want []string
			for _, price := range rest {
				want = append(want, price.ID.String())
			}
			assert.Equal(t, want, tc.graphql, tc.kind)
		}
	})

	t.Run("NarrowsPricesToAStatus", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		server := newBillingServer(t, nil)
		pro := newSoldLicense(t, server, "Pro")
		onSale := priceOf(t, server, "licenses", pro.Slug, flatFee("2900", "MONTHLY"))
		retired := priceOf(t, server, "licenses", pro.Slug, flatFee("29000", "ANNUAL"))
		deprecate(t, server, "licenses", pro.Slug, retired)
		seats := newSoldAddon(t, server, "Extra seats")
		seatsOnSale := priceOf(t, server, "addons", seats.Slug, flatFee("900", "MONTHLY"))
		seatsYear := priceOf(t, server, "addons", seats.Slug, flatFee("9000", "ANNUAL"))
		deprecate(t, server, "addons", seats.Slug, seatsYear)

		var data struct {
			Licenses struct {
				Items []struct {
					Prices []struct {
						ID string `json:"id"`
					} `json:"prices"`
				} `json:"items"`
			} `json:"licenses"`
			Addons struct {
				Items []struct {
					Prices []struct {
						ID string `json:"id"`
					} `json:"prices"`
				} `json:"items"`
			} `json:"addons"`
		}
		sendGraphQL(t, server, `{
			licenses { items { prices(status: "ACTIVE") { id } } }
			addons { items { prices(status: "ACTIVE") { id } } }
		}`, nil).decodeData(t, &data)

		require.Len(t, data.Licenses.Items, 1)
		require.Len(t, data.Licenses.Items[0].Prices, 1)
		assert.Equal(t, onSale.ID.String(), data.Licenses.Items[0].Prices[0].ID)
		require.Len(t, data.Addons.Items, 1)
		require.Len(t, data.Addons.Items[0].Prices, 1)
		assert.Equal(t, seatsOnSale.ID.String(), data.Addons.Items[0].Prices[0].ID)
	})

	t.Run("PagesEachListByACursorOfItsOwn", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		server := newBillingServer(t, nil)
		for _, name := range []string{"Starter", "Pro", "Enterprise"} {
			newSoldLicense(t, server, name)
		}
		for _, name := range []string{"Extra seats", "Extra storage", "Priority support"} {
			addon := newSoldAddon(t, server, name)
			priceOf(t, server, "addons", addon.Slug, flatFee("900", "MONTHLY"))
		}

		first := catalogOf(t, server, map[string]any{"limit": 2, "withLicenses": true, "withAddons": true})
		require.Len(t, first.Licenses.Items, 2)
		require.Len(t, first.Addons.Items, 2)
		require.True(t, first.Licenses.HasMore)
		require.True(t, first.Addons.HasMore)
		require.NotNil(t, first.Licenses.NextCursor)
		require.NotNil(t, first.Addons.NextCursor)

		// The licenses go on from their cursor, and the add-ons are left out: they are
		// not read again for a request that asks for the licenses alone.
		rest := catalogOf(t, server, map[string]any{
			"limit": 2, "licensesCursor": *first.Licenses.NextCursor, "withLicenses": true, "withAddons": false,
		})
		assert.Nil(t, rest.Addons, "a list the request leaves out is not in the answer")
		require.NotNil(t, rest.Licenses)
		require.Len(t, rest.Licenses.Items, 1)
		assert.False(t, rest.Licenses.HasMore)

		last := catalogOf(t, server, map[string]any{
			"limit": 2, "addonsCursor": *first.Addons.NextCursor, "withLicenses": false, "withAddons": true,
		})
		assert.Nil(t, last.Licenses)
		require.NotNil(t, last.Addons)
		require.Len(t, last.Addons.Items, 1)
		assert.False(t, last.Addons.HasMore)

		seen := map[string]bool{}
		for _, item := range append(first.Licenses.Items, rest.Licenses.Items...) {
			seen[item.ID] = true
		}
		assert.Len(t, seen, 3, "the pages of the licenses hold each version once")
		seen = map[string]bool{}
		for _, item := range append(first.Addons.Items, last.Addons.Items...) {
			seen[item.ID] = true
		}
		assert.Len(t, seen, 3, "the pages of the add-ons hold each version once")
	})

	t.Run("KeepsAnotherOrganizationsCatalogOut", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		other, err := organizationdb.New(testServer.Dependencies.DB).CreateOrganization(t.Context(), organizationdb.CreateOrganizationParams{
			ID: nil, ExternalID: "org-" + uuid.NewString(), Name: "Another Organization",
		})
		require.NoError(t, err)
		ours, theirs := newBillingServer(t, nil), newBillingServer(t, &other.ID)

		ourLicense := newSoldLicense(t, ours, "Ours")
		priceOf(t, ours, "licenses", ourLicense.Slug, flatFee("2900", "MONTHLY"))
		theirLicense := newSoldLicense(t, theirs, "Theirs")
		theirPrice := priceOf(t, theirs, "licenses", theirLicense.Slug, flatFee("100", "MONTHLY"))
		theirAddon := newSoldAddon(t, theirs, "Their add-on")
		theirAddonPrice := priceOf(t, theirs, "addons", theirAddon.Slug, flatFee("100", "MONTHLY"))

		data := catalogOf(t, ours, both())

		require.Len(t, data.Licenses.Items, 1)
		assert.Equal(t, ourLicense.ID.String(), data.Licenses.Items[0].ID)
		require.Len(t, data.Licenses.Items[0].Prices, 1)
		assert.Empty(t, data.Addons.Items, "an add-on of another organization is not listed")
		assert.NotContains(t, pricesIDs(data.Licenses.Items[0].Prices), theirPrice.ID.String())

		seen := catalogOf(t, theirs, both())
		require.Len(t, seen.Addons.Items, 1)
		assert.Equal(t, []string{theirAddonPrice.ID.String()}, pricesIDs(seen.Addons.Items[0].Prices))
	})

	// REST declares the status of a price list as an enum and answers 422 for another
	// value. GraphQL takes a free string, and gives the same refusal rather than an empty
	// list, which would read as "this version has no such price".
	t.Run("RefusesAStatusThatIsNotOne", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		billing := newBillingServer(t, nil)
		pro := newSoldLicense(t, billing, "Pro")
		priceOf(t, billing, "licenses", pro.Slug, flatFee("2900", "MONTHLY"))
		seats := newSoldAddon(t, billing, "Extra seats")
		priceOf(t, billing, "addons", seats.Slug, flatFee("900", "MONTHLY"))

		for name, document := range map[string]string{
			"license": `{ licenses { items { prices(status: "BOGUS") { id } } } }`,
			"add-on":  `{ addons { items { prices(status: "BOGUS") { id } } } }`,
		} {
			t.Run(name, func(t *testing.T) {
				answer := sendGraphQL(t, billing, document, nil)

				var envelope graphQLResponse
				require.NoError(t, json.Unmarshal(answer.body, &envelope))
				require.NotEmpty(t, envelope.Errors, string(answer.body))
				assert.Equal(t, "Prices.InvalidStatus", envelope.Errors[0].Extensions["code"])
				assert.EqualValues(t, http.StatusUnprocessableEntity, envelope.Errors[0].Extensions["status"])
			})
		}
	})

	// The add-ons are billing's, as GET /addons is: where the organization may not reach
	// billing, nothing of the catalog is read, and the refusal is the one REST gives.
	t.Run("IsRefusedWhereBillingIsOff", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		billing := newBillingServer(t, nil)
		seats := newSoldAddon(t, billing, "Extra seats")
		priceOf(t, billing, "addons", seats.Slug, flatFee("900", "MONTHLY"))

		// testServer holds every scope and does not have billing on.
		answer := sendGraphQL(t, testServer, catalogPricesDocument, both())

		require.Equal(t, http.StatusOK, answer.status, string(answer.body))
		var envelope graphQLResponse
		require.NoError(t, json.Unmarshal(answer.body, &envelope))
		require.Len(t, envelope.Errors, 1, string(answer.body))
		assert.Equal(t, "Billing.Disabled", envelope.Errors[0].Extensions["code"])
		assert.EqualValues(t, http.StatusForbidden, envelope.Errors[0].Extensions["status"])
		assert.NotContains(t, string(answer.body), seats.Slug)
	})

	// The gate reads the scopes of the whole document, as it does for any other: the
	// licenses a session may read are not served beside add-ons it may not.
	t.Run("NeedsTheScopeOfEachListAndRefusesTheDocumentWhole", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		billing := newBillingServer(t, nil)
		pro := newSoldLicense(t, billing, "Pro")
		seats := newSoldAddon(t, billing, "Extra seats")

		for name, tc := range map[string]struct {
			scopes  []string
			missing string
		}{
			"licenses alone":      {scopes: []string{readLicenses}, missing: scope.Read(scope.Addons)},
			"add-ons alone":       {scopes: []string{scope.Read(scope.Addons)}, missing: readLicenses},
			"the billing scope":   {scopes: []string{scope.Read(scope.Billing)}, missing: readLicenses},
			"the scope of prices": {scopes: []string{scope.Read(scope.Entitlements)}, missing: readLicenses},
		} {
			t.Run(name, func(t *testing.T) {
				answer := sendGraphQL(t, newBillingServer(t, nil, tc.scopes...), catalogPricesDocument, both())

				answer.requireMissingScope(t, tc.missing)
				assert.NotContains(t, string(answer.body), pro.Slug)
				assert.NotContains(t, string(answer.body), seats.Slug)
			})
		}

		var data catalogData
		sendGraphQL(t, newBillingServer(t, nil, readLicenses, scope.Read(scope.Addons)), catalogPricesDocument, both()).
			decodeData(t, &data)
		assert.Len(t, data.Licenses.Items, 1)
		assert.Len(t, data.Addons.Items, 1)
	})
}

func pricesIDs(list []catalogPrice) []string {
	ids := make([]string, len(list))
	for i, price := range list {
		ids[i] = price.ID
	}

	return ids
}
