package graphql_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/addentitlementtogroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementgroup"
	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// newPresentedEntitlement creates a NUMBER entitlement carrying every
// presentation field (icon, units, userFacing, displayOrder).
func newPresentedEntitlement(t *testing.T, slug string, displayOrder int32) *entitlementsschema.Entitlement {
	t.Helper()
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:              "Seats " + slug,
			Slug:              slug,
			Description:       ptr.To("Number of seats"),
			Type:              entitlementsschema.Number,
			AggregationMethod: ptr.To(entitlementsschema.Sum),
			Icon:              ptr.To("lucide:users"),
			UnitSingular:      ptr.To("seat"),
			UnitPlural:        ptr.To("seats"),
			UserFacing:        true,
			DisplayOrder:      displayOrder,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
	return entitlement
}

func associateNumberEntitlement(t *testing.T, licenseSlug, entitlementSlug string, threshold int32) {
	t.Helper()
	repo := associateentitlementwithlicense.NewCommandRepository(
		uow.NewUnitOfWork(testServer.Dependencies.DB),
	)
	request := associateentitlementwithlicense.Command{
		EntitlementSlug: entitlementSlug,
		Value:           map[string]any{"type": "number", "value": threshold},
	}
	_, err := repo.AssociateEntitlementToLicense(
		t.Context(), licenseSlug, &request,
		testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
}

func newGroupWithMember(t *testing.T, groupSlug, entitlementSlug string) {
	t.Helper()
	groupRepo := createentitlementgroup.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	_, err := groupRepo.CreateEntitlementGroup(
		t.Context(),
		createentitlementgroup.CreateEntitlementGroupInput{Name: "Platform", Slug: groupSlug},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	memberRepo := addentitlementtogroup.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	_, err = memberRepo.AddEntitlementToGroup(
		t.Context(), groupSlug, entitlementSlug,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
}

func TestGraphQL_Entitlements_PresentationFields(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	entitlement := newPresentedEntitlement(t, "gql-seats", 10)
	newGroupWithMember(t, "gql-platform", entitlement.Slug)

	resp := executeGraphQL(t, `
		query {
			entitlements {
				items {
					slug
					description
					type
					icon
					unitSingular
					unitPlural
					userFacing
					displayOrder
					entitlementGroups { slug name }
				}
			}
		}
	`, nil)
	require.Empty(t, resp.Errors)

	var data struct {
		Entitlements struct {
			Items []struct {
				Slug              string  `json:"slug"`
				Description       *string `json:"description"`
				Type              string  `json:"type"`
				Icon              *string `json:"icon"`
				UnitSingular      *string `json:"unitSingular"`
				UnitPlural        *string `json:"unitPlural"`
				UserFacing        *bool   `json:"userFacing"`
				DisplayOrder      *int32  `json:"displayOrder"`
				EntitlementGroups []struct {
					Slug string `json:"slug"`
					Name string `json:"name"`
				} `json:"entitlementGroups"`
			} `json:"items"`
		} `json:"entitlements"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))

	var found bool
	for _, e := range data.Entitlements.Items {
		if e.Slug != entitlement.Slug {
			continue
		}
		found = true
		assert.Equal(t, "NUMBER", e.Type)
		require.NotNil(t, e.Icon)
		assert.Equal(t, "lucide:users", *e.Icon)
		require.NotNil(t, e.UnitSingular)
		assert.Equal(t, "seat", *e.UnitSingular)
		require.NotNil(t, e.UnitPlural)
		assert.Equal(t, "seats", *e.UnitPlural)
		require.NotNil(t, e.UserFacing)
		assert.True(t, *e.UserFacing)
		require.NotNil(t, e.DisplayOrder)
		assert.EqualValues(t, 10, *e.DisplayOrder)
		require.Len(t, e.EntitlementGroups, 1)
		assert.Equal(t, "gql-platform", e.EntitlementGroups[0].Slug)
	}
	require.True(t, found, "created entitlement not returned by Query.entitlements")
}

func TestGraphQL_LicenseEntitlements_FullDefinition(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	license := newLicense(t, "GQL Plan")
	entitlement := newPresentedEntitlement(t, "gql-le-seats", 20)
	newGroupWithMember(t, "gql-le-platform", entitlement.Slug)
	associateNumberEntitlement(t, license.Slug, entitlement.Slug, 120)

	resp := executeGraphQL(t, `
		query {
			licenses {
				items {
					slug
					entitlements {
						entitlementSlug
						entitlementName
						entitlementType
						licenseSlug
						value
						entitlement {
							icon
							unitSingular
							unitPlural
							userFacing
							displayOrder
							entitlementGroups { slug }
						}
					}
				}
			}
		}
	`, nil)
	require.Empty(t, resp.Errors)

	var data struct {
		Licenses struct {
			Items []struct {
				Slug         string `json:"slug"`
				Entitlements []struct {
					EntitlementSlug string         `json:"entitlementSlug"`
					EntitlementName string         `json:"entitlementName"`
					EntitlementType string         `json:"entitlementType"`
					LicenseSlug     string         `json:"licenseSlug"`
					Value           map[string]any `json:"value"`
					Entitlement     struct {
						Icon              *string `json:"icon"`
						UnitSingular      *string `json:"unitSingular"`
						UnitPlural        *string `json:"unitPlural"`
						UserFacing        *bool   `json:"userFacing"`
						DisplayOrder      *int32  `json:"displayOrder"`
						EntitlementGroups []struct {
							Slug string `json:"slug"`
						} `json:"entitlementGroups"`
					} `json:"entitlement"`
				} `json:"entitlements"`
			} `json:"items"`
		} `json:"licenses"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))

	var checked bool
	for _, l := range data.Licenses.Items {
		if l.Slug != license.Slug {
			continue
		}
		require.Len(t, l.Entitlements, 1)
		grant := l.Entitlements[0]
		assert.Equal(t, entitlement.Slug, grant.EntitlementSlug)
		assert.Equal(t, "NUMBER", grant.EntitlementType)
		assert.Equal(t, license.Slug, grant.LicenseSlug)
		assert.Equal(t, "number", grant.Value["type"])
		assert.EqualValues(t, 120, grant.Value["value"])
		require.NotNil(t, grant.Entitlement.Icon)
		assert.Equal(t, "lucide:users", *grant.Entitlement.Icon)
		require.NotNil(t, grant.Entitlement.UnitPlural)
		assert.Equal(t, "seats", *grant.Entitlement.UnitPlural)
		require.NotNil(t, grant.Entitlement.UserFacing)
		assert.True(t, *grant.Entitlement.UserFacing)
		require.NotNil(t, grant.Entitlement.DisplayOrder)
		assert.EqualValues(t, 20, *grant.Entitlement.DisplayOrder)
		require.Len(t, grant.Entitlement.EntitlementGroups, 1)
		assert.Equal(t, "gql-le-platform", grant.Entitlement.EntitlementGroups[0].Slug)
		checked = true
	}
	require.True(t, checked, "license with entitlements not returned")
}
