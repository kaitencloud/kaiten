package graphql_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instancesdb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

func mustMarshalNumberUsage(t *testing.T, value float64, eventCount int32) []byte {
	t.Helper()
	raw, err := json.Marshal(entitlementvalue.NumberUsageValue{Type: entitlementvalue.TypeNumber, Value: value, EventCount: eventCount})
	require.NoError(t, err)
	return raw
}

func newPeriodicGraphQLEntitlement(t *testing.T, slug string, resetPeriod period.ResetPeriod, resetAnchor period.ResetAnchor) *entitlementsschema.Entitlement {
	t.Helper()
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:              "Periodic " + slug,
			Slug:              slug,
			Type:              entitlementsschema.Number,
			AggregationMethod: ptr.To(entitlementsschema.Sum),
			ResetPeriod:       &resetPeriod,
			ResetAnchor:       &resetAnchor,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
	return entitlement
}

func TestGraphQL_Entitlement_ResetPeriodFields(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	entitlement := newPeriodicGraphQLEntitlement(t, "gql-reset-period", period.Month, period.Calendar)

	resp := executeGraphQL(t, `
		query {
			entitlements(limit: 100) {
				items {
					slug
					resetPeriod
					resetAnchor
				}
			}
		}
	`, nil)
	require.Empty(t, resp.Errors)

	var data struct {
		Entitlements struct {
			Items []struct {
				Slug        string `json:"slug"`
				ResetPeriod string `json:"resetPeriod"`
				ResetAnchor string `json:"resetAnchor"`
			} `json:"items"`
		} `json:"entitlements"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))

	found := false
	for _, item := range data.Entitlements.Items {
		if item.Slug != entitlement.Slug {
			continue
		}
		found = true
		require.Equal(t, "MONTH", item.ResetPeriod)
		require.Equal(t, "CALENDAR", item.ResetAnchor)
	}
	require.True(t, found, "expected to find entitlement %q in the entitlements page", entitlement.Slug)
}

func TestGraphQL_InstanceEntitlementUsage_CurrentPeriodBounds(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newCustomer(t, "GQL Period Co")
	license := newLicense(t, "GQL Period Plan")
	lifetime := newPresentedEntitlement(t, "gql-period-lifetime", 1)
	periodic := newPeriodicGraphQLEntitlement(t, "gql-period-monthly", period.Month, period.Calendar)
	associateNumberEntitlement(t, license.Slug, lifetime.Slug, 100)
	associateNumberEntitlement(t, license.Slug, periodic.Slug, 100)
	instance := newInstance(t, "gql-period-instance", customer, license)

	currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)
	reportUsage(t, instance.ID, lifetime.ID, 4, 1)

	require.NoError(t, instancesdb.New(testServer.Dependencies.DB).ReportEntitlementUsage(t.Context(), instancesdb.ReportEntitlementUsageParams{
		EntitlementID:  periodic.ID,
		InstanceID:     instance.ID,
		Value:          mustMarshalNumberUsage(t, 12, 2),
		OrganizationID: testDb.DefaultData.OrganizationID,
		PeriodStart:    pgtype.Timestamp{Time: currentWindow.Start, Valid: true},
	}))

	resp := executeGraphQL(t, `
		query($slug: String!) {
			customer(slug: $slug) {
				instances {
					entitlementUsage {
						entitlementSlug
						value
						currentPeriodStart
						currentPeriodEnd
					}
				}
			}
		}
	`, map[string]interface{}{"slug": customer.Slug})
	require.Empty(t, resp.Errors)

	var data struct {
		Customer struct {
			Instances []struct {
				EntitlementUsage []struct {
					EntitlementSlug    string     `json:"entitlementSlug"`
					Value              any        `json:"value"`
					CurrentPeriodStart *time.Time `json:"currentPeriodStart"`
					CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd"`
				} `json:"entitlementUsage"`
			} `json:"instances"`
		} `json:"customer"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	require.Len(t, data.Customer.Instances, 1)

	usage := map[string]struct {
		CurrentPeriodStart *time.Time
		CurrentPeriodEnd   *time.Time
	}{}
	for _, row := range data.Customer.Instances[0].EntitlementUsage {
		usage[row.EntitlementSlug] = struct {
			CurrentPeriodStart *time.Time
			CurrentPeriodEnd   *time.Time
		}{row.CurrentPeriodStart, row.CurrentPeriodEnd}
	}

	require.Contains(t, usage, lifetime.Slug)
	require.Nil(t, usage[lifetime.Slug].CurrentPeriodStart)

	require.Contains(t, usage, periodic.Slug)
	require.NotNil(t, usage[periodic.Slug].CurrentPeriodStart)
	require.True(t, usage[periodic.Slug].CurrentPeriodStart.Equal(currentWindow.Start))
	require.NotNil(t, usage[periodic.Slug].CurrentPeriodEnd)
	require.True(t, usage[periodic.Slug].CurrentPeriodEnd.Equal(currentWindow.End))
}
