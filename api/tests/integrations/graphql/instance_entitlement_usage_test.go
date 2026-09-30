package graphql_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	instancesdb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

func reportUsage(t *testing.T, instanceID, entitlementID uuid.UUID, value float64, eventCount int32) {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"type": "number", "value": value, "event_count": eventCount})
	require.NoError(t, err)
	err = instancesdb.New(testServer.Dependencies.DB).ReportEntitlementUsage(t.Context(), instancesdb.ReportEntitlementUsageParams{
		EntitlementID:  entitlementID,
		InstanceID:     instanceID,
		Value:          raw,
		OrganizationID: testDb.DefaultData.OrganizationID,
		PeriodStart:    pgtype.Timestamp{}, // lifetime entitlement: no configured reset period
	})
	require.NoError(t, err)
}

// The composed licensing-snapshot read the SDK issues: ONE query walking
// customer → instances → license grants (+unlimited) → entitlement usage.
func TestGraphQL_InstanceEntitlementUsage_ComposedSnapshot(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newCustomer(t, "GQL Snapshot Co")
	license := newLicense(t, "GQL Snapshot Plan")
	seats := newPresentedEntitlement(t, "gql-snap-seats", 10)
	apiCalls := newPresentedEntitlement(t, "gql-snap-api-calls", 20)
	associateNumberEntitlement(t, license.Slug, seats.Slug, 120)
	associateNumberEntitlement(t, license.Slug, apiCalls.Slug, -1)
	instance := newInstance(t, "gql-snap-instance", customer, license)
	reportUsage(t, instance.ID, seats.ID, 68, 3)

	resp := executeGraphQL(t, `
		query($slug: String!) {
			customer(slug: $slug) {
				slug
				instances {
					slug
					customerSlug
					licenseSlug
					license {
						slug
						entitlements {
							entitlementSlug
							value
							unlimited
						}
					}
					entitlementUsage {
						entitlementSlug
						licenseSlug
						value
					}
				}
			}
		}
	`, map[string]interface{}{"slug": customer.Slug})
	require.Empty(t, resp.Errors)

	var data struct {
		Customer struct {
			Slug      string `json:"slug"`
			Instances []struct {
				Slug         string `json:"slug"`
				CustomerSlug string `json:"customerSlug"`
				LicenseSlug  string `json:"licenseSlug"`
				License      struct {
					Slug         string `json:"slug"`
					Entitlements []struct {
						EntitlementSlug string         `json:"entitlementSlug"`
						Value           map[string]any `json:"value"`
						Unlimited       bool           `json:"unlimited"`
					} `json:"entitlements"`
				} `json:"license"`
				EntitlementUsage []struct {
					EntitlementSlug string         `json:"entitlementSlug"`
					LicenseSlug     string         `json:"licenseSlug"`
					Value           map[string]any `json:"value"`
				} `json:"entitlementUsage"`
			} `json:"instances"`
		} `json:"customer"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))

	require.Len(t, data.Customer.Instances, 1)
	inst := data.Customer.Instances[0]
	assert.Equal(t, instance.Slug, inst.Slug)
	assert.Equal(t, customer.Slug, inst.CustomerSlug)
	assert.Equal(t, license.Slug, inst.LicenseSlug)
	assert.Equal(t, license.Slug, inst.License.Slug)

	// Grants: the capped one is not unlimited, the sentinel one is.
	require.Len(t, inst.License.Entitlements, 2)
	grants := map[string]struct {
		value     map[string]any
		unlimited bool
	}{}
	for _, grant := range inst.License.Entitlements {
		grants[grant.EntitlementSlug] = struct {
			value     map[string]any
			unlimited bool
		}{grant.Value, grant.Unlimited}
	}
	require.Contains(t, grants, seats.Slug)
	assert.False(t, grants[seats.Slug].unlimited)
	assert.EqualValues(t, 120, grants[seats.Slug].value["value"])
	require.Contains(t, grants, apiCalls.Slug)
	assert.True(t, grants[apiCalls.Slug].unlimited)

	// Usage: one row per grant; reported usage round-trips, unreported grants
	// are zero-defaulted — identical to the REST usage endpoint.
	require.Len(t, inst.EntitlementUsage, 2)
	usage := map[string]map[string]any{}
	for _, row := range inst.EntitlementUsage {
		assert.Equal(t, license.Slug, row.LicenseSlug)
		usage[row.EntitlementSlug] = row.Value
	}
	require.Contains(t, usage, seats.Slug)
	assert.Equal(t, "number", usage[seats.Slug]["type"])
	assert.EqualValues(t, 68, usage[seats.Slug]["value"])
	assert.EqualValues(t, 3, usage[seats.Slug]["event_count"])
	require.Contains(t, usage, apiCalls.Slug)
	assert.EqualValues(t, 0, usage[apiCalls.Slug]["value"])
	// event_count is omitempty on the wire: absent when zero, same as REST.
	assert.NotContains(t, usage[apiCalls.Slug], "event_count")
}
