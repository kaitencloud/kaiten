package licenses_test

import (
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	licensesschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// newEntitlementWithSlug creates a NUMBER entitlement with a caller-chosen
// slug, so multiple distinct entitlements can be granted to the same
// license within a single test (newEntitlementWithType always uses the
// same hardcoded slug).
func newEntitlementWithSlug(t *testing.T, slug string) *entitlementsschema.Entitlement {
	t.Helper()
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name: "Entitlement " + slug,
			Slug: slug,
			Type: entitlementsschema.Number,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
	return entitlement
}

func grantEntitlementsToLicense(t *testing.T, licenseSlug string, count int) []*entitlementsschema.Entitlement {
	t.Helper()
	repo := associateentitlementwithlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	entitlements := make([]*entitlementsschema.Entitlement, 0, count)
	for i := range count {
		entitlement := newEntitlementWithSlug(t, "grant-"+strconv.Itoa(i))
		_, err := repo.AssociateEntitlementToLicense(
			t.Context(),
			licenseSlug,
			&associateentitlementwithlicense.Command{
				EntitlementSlug: entitlement.Slug,
				Value:           map[string]any{"type": "number", "value": 10},
			},
			testDb.DefaultData.UserID,
			testDb.DefaultData.OrganizationID,
		)
		require.NoError(t, err)
		entitlements = append(entitlements, entitlement)
	}
	return entitlements
}

func TestGetLicenseEntitlements(t *testing.T) {
	t.Run("WhenEntitlementBelongsToGroups_ReturnsEmbeddedGroupRefs", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		newEntitlementGroup(t, "Usage", "usage")
		addEntitlementGroupMembership(t, "usage", entitlement.Slug)
		newLicenseEntitlementWithThreshold(t, licenses[0].Slug, entitlement.Slug, 10)

		req := httptest.NewRequest("GET", "/api/licenses/"+licenses[0].Slug+"/entitlements", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[pagination.Page[licensesschema.LicenseEntitlement]](t, resp, fiber.StatusOK)
		entitlements := actual.Items
		require.Len(t, entitlements, 1)
		require.Len(t, entitlements[0].EntitlementGroups, 1)
		require.Equal(t, "usage", entitlements[0].EntitlementGroups[0].Slug)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		grantEntitlementsToLicense(t, licenses[0].Slug, 3)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/licenses/"+licenses[0].Slug+"/entitlements?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[licensesschema.LicenseEntitlement]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		granted := grantEntitlementsToLicense(t, licenses[0].Slug, 3)
		expectedSlugs := make([]string, len(granted))
		for i, e := range granted {
			expectedSlugs[i] = e.Slug
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/licenses/"+licenses[0].Slug+"/entitlements?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[licensesschema.LicenseEntitlement]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/licenses/"+licenses[0].Slug+"/entitlements?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every granted entitlement exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[licensesschema.LicenseEntitlement]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]licensesschema.LicenseEntitlement{}, page1.Items...), page2.Items...)
		actualSlugs := make([]string, len(combined))
		for i, e := range combined {
			actualSlugs[i] = e.EntitlementSlug
		}
		require.ElementsMatch(t, expectedSlugs, actualSlugs)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)

		// Act
		req := httptest.NewRequest("GET", "/api/licenses/"+licenses[0].Slug+"/entitlements?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
