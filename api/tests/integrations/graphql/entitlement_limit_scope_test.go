package graphql_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

func newScopedGraphQLEntitlement(t *testing.T, slug string, scope entitlementsschema.LimitScope) *entitlementsschema.Entitlement {
	t.Helper()
	entitlement, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:              "Scoped " + slug,
			Slug:              slug,
			Type:              entitlementsschema.Number,
			AggregationMethod: ptr.To(entitlementsschema.Sum),
			LimitScope:        scope,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
	return entitlement
}

func newFlagGraphQLEntitlement(t *testing.T, slug string) {
	t.Helper()
	_, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{Name: "Flag " + slug, Slug: slug, Type: entitlementsschema.Boolean},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
}

// seedResourceCounters writes an entitlement's per-resource counters, and the
// pair's row the report path keeps beside them: the highest of them.
func seedResourceCounters(t *testing.T, instanceID, entitlementID uuid.UUID, counters map[string]float64) {
	t.Helper()
	highest := 0.0
	for key, value := range counters {
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO entitlement_resource_usage (entitlement_id, instance_id, resource_key, organization_id, value)
			VALUES ($1, $2, $3, $4, jsonb_build_object('type', 'number', 'value', $5::float8, 'event_count', 1))`,
			entitlementID, instanceID, key, testDb.DefaultData.OrganizationID, value)
		require.NoError(t, err)
		highest = max(highest, value)
	}
	reportUsage(t, instanceID, entitlementID, highest, 1)
}

func TestGraphQL_Entitlement_LimitScope(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newScopedGraphQLEntitlement(t, "gql-per-resource", entitlementsschema.LimitScopeResource)
	newScopedGraphQLEntitlement(t, "gql-per-instance", entitlementsschema.LimitScopeInstance)
	newFlagGraphQLEntitlement(t, "gql-flag")

	resp := executeGraphQL(t, `query { entitlements(limit: 100) { items { slug limitScope } } }`, nil)
	require.Empty(t, resp.Errors)

	var data struct {
		Entitlements struct {
			Items []struct {
				Slug       string  `json:"slug"`
				LimitScope *string `json:"limitScope"`
			} `json:"items"`
		} `json:"entitlements"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	scopes := map[string]*string{}
	for _, item := range data.Entitlements.Items {
		scopes[item.Slug] = item.LimitScope
	}
	require.Equal(t, ptr.To("RESOURCE"), scopes["gql-per-resource"])
	require.Equal(t, ptr.To("INSTANCE"), scopes["gql-per-instance"])
	require.Contains(t, scopes, "gql-flag")
	assert.Nil(t, scopes["gql-flag"], "a flag has no counter to scope")
}

func TestGraphQL_InstanceEntitlementUsage_Resources(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	customer := newCustomer(t, "GQL Resources Co")
	license := newLicense(t, "GQL Resources Plan")
	perResource := newScopedGraphQLEntitlement(t, "gql-sources", entitlementsschema.LimitScopeResource)
	perInstance := newScopedGraphQLEntitlement(t, "gql-seats", entitlementsschema.LimitScopeInstance)
	associateNumberEntitlement(t, license.Slug, perResource.Slug, 4)
	associateNumberEntitlement(t, license.Slug, perInstance.Slug, 4)
	instance := newInstance(t, "gql-resources-instance", customer, license)
	seedResourceCounters(t, instance.ID, perResource.ID, map[string]float64{"stigg": 2, "paid": 4, "schematic": 4})
	reportUsage(t, instance.ID, perInstance.ID, 1, 1)

	resp := executeGraphQL(t, `
		query($slug: String!) {
			instance(slug: $slug) {
				entitlementUsage {
					entitlementSlug
					value
					limit
					resourceKey
					resources { count atLimit }
				}
			}
		}`, map[string]any{"slug": instance.Slug})
	require.Empty(t, resp.Errors)

	var data struct {
		Instance struct {
			EntitlementUsage []struct {
				EntitlementSlug string         `json:"entitlementSlug"`
				Value           map[string]any `json:"value"`
				Limit           map[string]any `json:"limit"`
				ResourceKey     *string        `json:"resourceKey"`
				Resources       *struct {
					Count   int `json:"count"`
					AtLimit int `json:"atLimit"`
				} `json:"resources"`
			} `json:"entitlementUsage"`
		} `json:"instance"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	require.Len(t, data.Instance.EntitlementUsage, 2)
	for _, row := range data.Instance.EntitlementUsage {
		assert.Nil(t, row.ResourceKey, "an entitlement's own usage names no resource")
		switch row.EntitlementSlug {
		case perResource.Slug:
			assert.EqualValues(t, 4, row.Value["value"], "the highest counter")
			assert.EqualValues(t, 4, row.Limit["value"], "the limit of each resource")
			require.NotNil(t, row.Resources)
			assert.Equal(t, 3, row.Resources.Count)
			assert.Equal(t, 2, row.Resources.AtLimit)
		case perInstance.Slug:
			assert.Nil(t, row.Resources)
		default:
			t.Fatalf("unexpected entitlement %q", row.EntitlementSlug)
		}
	}
}
