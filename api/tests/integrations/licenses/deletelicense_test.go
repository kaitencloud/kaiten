package licenses_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licenseEvents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteLicense(t *testing.T) {
	t.Run("WhenLicenseExists_DeletesLicense", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		toDelete := licenses[0]

		// Act
		req := httptest.NewRequest("DELETE", "/api/licenses/"+toDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		_, err = repo.GetLicense(t.Context(), toDelete.Slug, testDb.DefaultData.OrganizationID)
		require.Error(t, err)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the license deleted event
		var eventData schema.License
		found := false
		for _, event := range events {
			if event.EventName == licenseEvents.LicenseDeleted.Name {
				assert.Equal(t, licenseEvents.LicenseDeleted.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_DELETION event to be present")

		// Verify event data contains the deleted license information
		assert.Equal(t, toDelete.ID, eventData.ID)
	})

	t.Run("WhenLicenseIsStillReferenced_Returns409", func(t *testing.T) {
		// Arrange: license_entitlement references license with
		// ON DELETE RESTRICT, so the delete is refused by Postgres.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Boolean)
		newLicenseEntitlementWithEnabled(t, licenses[0].Slug, entitlement.Slug, true)

		// Act
		req := httptest.NewRequest("DELETE", "/api/licenses/"+licenses[0].Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusConflict, resp.StatusCode, "a license still in use must be refused with 409, not 500")
	})

	t.Run("WhenLicenseDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("DELETE", "/api/licenses/nonexistent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}

// TestDeleteLicense_FamilyLifecycle covers what happens to the family when a
// version goes. A family is the product; one with no versions left is not a
// state the API can represent -- nothing to resolve to, a slug reserved with
// no way to release it -- so the last version takes the family with it, and
// only the last one.
func TestDeleteLicense_FamilyLifecycle(t *testing.T) {
	t.Run("WhenTheLastVersionIsDeleted_TheFamilyGoesWithItAndFreesItsSlug", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

		only, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Sunset Product",
			Slug:        ptr.To("sunset-product"),
			Description: "The only version",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.True(t, familyExists(t, only.FamilyID))

		req := httptest.NewRequest("DELETE", "/api/licenses/"+only.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		require.False(t, familyExists(t, only.FamilyID), "the family does not outlive its last version")

		// The slug is a product's address again: a new product can open under it.
		reborn, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Sunset Product",
			Slug:        ptr.To("sunset-product"),
			Description: "A new product under the freed slug",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotEqual(t, only.FamilyID, reborn.FamilyID, "a new family, not the old one resurrected")
		require.Equal(t, "1", reborn.Version)
	})

	t.Run("WhenAnotherVersionRemains_TheFamilyStays", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "kept-product"

		first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Kept Product",
			Slug:        ptr.To(familySlug),
			Description: "Version 1, the one that opened the family",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		second, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Kept Product",
			FamilySlug:  ptr.To(familySlug),
			Description: "Version 2",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		req := httptest.NewRequest("DELETE", "/api/licenses/"+first.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		require.True(t, familyExists(t, first.FamilyID), "a family with a version left is untouched")

		// The family's address outlives the version that opened it: the slug
		// a pricing URL points at keeps resolving, now to v2.
		family := getFamily(t, familySlug, "")
		require.NotNil(t, family.CurrentVersion)
		require.Equal(t, second.Slug, family.CurrentVersion.Slug)
		require.Equal(t, int32(1), family.VersionCount)
	})
}

func familyExists(t *testing.T, familyID uuid.UUID) bool {
	t.Helper()
	var exists bool
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT EXISTS (SELECT 1 FROM "license_family" WHERE "id" = $1)`, familyID).Scan(&exists))
	return exists
}
