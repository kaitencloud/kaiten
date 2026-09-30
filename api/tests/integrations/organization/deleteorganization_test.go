package organization_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/getorganization"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteOrganization(t *testing.T) {
	t.Run("WhenOrganizationExists_DeletesOrganizationAndMemberships", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)
		userID := createUser(t)
		createMembership(t, orgID, userID)

		req := httptest.NewRequest("DELETE", "/api/platform/organizations/"+orgID.String(), nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getorganization.NewQueryRepository(organizationdb.New(testServer.Dependencies.DB))
		_, err = repo.GetOrganization(t.Context(), orgID)
		require.Error(t, err, "deleted organization should no longer be gettable")

		require.Equal(t, 0, countRows(t, `SELECT count(*) FROM organization WHERE id = $1`, orgID),
			"the organization row itself must be gone, not flagged")
		// Every membership, including system:kaiten's -- which the protect
		// trigger refuses to let anything soft-delete. Deleting the organization
		// is the one permitted way for it to go, and it goes through the FK's
		// ON DELETE CASCADE rather than through an UPDATE, so the trigger never
		// fires. Zero here is what proves that path still works.
		require.Equal(t, 0, countRows(t, `SELECT count(*) FROM user_on_organization WHERE organization_id = $1`, orgID),
			"memberships must go with the organization")
		require.Equal(t, 1, countRows(t, `SELECT count(*) FROM "user" WHERE id = $1 AND deleted_at IS NULL`, userID),
			"the user is a global identity and survives the organization it belonged to")
	})

	// the defect was that these three tables have no deleted_at, so
	// under the old soft delete their rows stayed live and readable by
	// anything holding the organization id. The cascade is what makes the
	// organization the only thing that has to be checked.
	t.Run("WhenOrganizationIsDeleted_ItsCustomersLicensesAndFeatureFlagsDoNotSurvive", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)
		authorID := createUser(t)
		createMembership(t, orgID, authorID)

		customerID := createCustomer(t, orgID, authorID)
		licenseID := createLicense(t, orgID)
		flagID := createFeatureFlag(t, orgID)

		// A neighbouring organization's rows of the same three kinds, to
		// prove the cascade is scoped to its own tenant.
		otherOrgID := createOrganization(t)
		otherCustomerID := createCustomer(t, otherOrgID, authorID)
		otherLicenseID := createLicense(t, otherOrgID)
		otherFlagID := createFeatureFlag(t, otherOrgID)

		req := httptest.NewRequest("DELETE", "/api/platform/organizations/"+orgID.String(), nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		require.Equal(t, 0, countRows(t, `SELECT count(*) FROM customer WHERE id = $1`, customerID),
			"customer must not outlive its organization")
		require.Equal(t, 0, countRows(t, `SELECT count(*) FROM license WHERE id = $1`, licenseID),
			"license must not outlive its organization")
		require.Equal(t, 0, countRows(t, `SELECT count(*) FROM feature_flags WHERE id = $1`, flagID),
			"feature flag must not outlive its organization")

		require.Equal(t, 1, countRows(t, `SELECT count(*) FROM customer WHERE id = $1`, otherCustomerID))
		require.Equal(t, 1, countRows(t, `SELECT count(*) FROM license WHERE id = $1`, otherLicenseID))
		require.Equal(t, 1, countRows(t, `SELECT count(*) FROM feature_flags WHERE id = $1`, otherFlagID))
	})

	t.Run("WhenOrganizationDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		req := httptest.NewRequest("DELETE", "/api/platform/organizations/00000000-0000-0000-0000-000000000099", nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WithoutDeleteScope_Returns403", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)

		readOnlyServer := tests.NewTestServer(testDb, tests.TestServerOptions{
			PlatformCredential: true,
			Scopes:             []string{scope.Write(scope.Organizations)},
		})

		req := httptest.NewRequest("DELETE", "/api/platform/organizations/"+orgID.String(), nil)
		resp, err := readOnlyServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusForbidden, resp.StatusCode, "write:organizations must not imply delete:organizations")

		require.Equal(t, 1, countRows(t, `SELECT count(*) FROM organization WHERE id = $1`, orgID),
			"the refused organization must be untouched")
	})

	// IsGoneFromTheCoreAPI is the removal half of the move. Asserted with an
	// organization credential: it reaches the router, so a 404 means "no such
	// operation" rather than "your credential was refused first".
	t.Run("IsGoneFromTheCoreAPI", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)

		req := httptest.NewRequest("DELETE", "/api/organizations/"+orgID.String(), nil)
		resp, err := coreServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode,
			"delete-organization is still reachable on the Core API")
		require.Equal(t, 1, countRows(t, `SELECT count(*) FROM organization WHERE id = $1`, orgID),
			"the Core API request deleted the organization anyway")
	})
}

func countRows(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), query, args...).Scan(&n))
	return n
}

func createCustomer(t *testing.T, organizationID, authorID uuid.UUID) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testDb.DbPool.Exec(t.Context(), `
		INSERT INTO customer (id, name, slug, created_by_id, updated_by_id, organization_id)
		VALUES ($1, 'Cascade Customer', $2, $3, $3, $4)
	`, id, "customer-"+id.String(), authorID, organizationID)
	require.NoError(t, err)
	return id
}

// createLicense inserts a license and the family it is version 1 of. Both rows
// are organization-scoped and both are expected to go when the organization
// does -- license.family_id cascades from license_family, which cascades from
// organization, so this also covers the two-table cascade introduced.
func createLicense(t *testing.T, organizationID uuid.UUID) uuid.UUID {
	t.Helper()
	id := uuid.New()
	familyID := uuid.New()
	_, err := testDb.DbPool.Exec(t.Context(), `
		INSERT INTO license_family (id, slug, organization_id)
		VALUES ($1, $2, $3)
	`, familyID, "family-"+familyID.String(), organizationID)
	require.NoError(t, err)

	_, err = testDb.DbPool.Exec(t.Context(), `
		INSERT INTO license (id, name, slug, description, type, lifecycle_state, organization_id, family_id)
		VALUES ($1, $2, $3, 'Cascade license', 'PAID', 'PUBLISHED', $4, $5)
	`, id, "License "+id.String(), "license-"+id.String(), organizationID, familyID)
	require.NoError(t, err)
	return id
}

func createFeatureFlag(t *testing.T, organizationID uuid.UUID) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testDb.DbPool.Exec(t.Context(), `
		INSERT INTO feature_flags (id, type, variants, name, slug, enabled, event_name, organization_id, default_variant)
		VALUES ($1, 'boolean', '{}'::jsonb, 'Cascade Flag', $2, true, 'cascade.flag', $3, 'false'::jsonb)
	`, id, "flag-"+id.String(), organizationID)
	require.NoError(t, err)
	return id
}
