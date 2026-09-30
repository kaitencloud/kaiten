package licenses_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// TestLicenseFamily_AnotherOrganizationsFamilyIsOutOfReach pins the tenancy of
// every family entry point. Each one filters on the caller's organization, and
// since familyId arrives in a request body, the schema backs that filter up:
// license references its family by (family_id, organization_id), as instance
// references its license. A family of another organization is
// reported as missing, never listed, and never joined.
func TestLicenseFamily_AnotherOrganizationsFamilyIsOutOfReach(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	const theirSlug = "neighbour-pro"
	neighbour := newNeighbourOrganization(t)
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	theirs, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Neighbour Pro",
		Slug:        ptr.To(theirSlug),
		Description: "Another organization's product",
		Type:        schema.Paid,
	}, neighbour)
	require.NoError(t, err)

	t.Run("TheFamilyListLeavesItOut", func(t *testing.T) {
		for _, family := range listFamilies(t, "").Items {
			require.NotEqual(t, theirs.FamilyID, family.ID)
		}
	})

	t.Run("TheFamilyEndpointReportsItMissing", func(t *testing.T) {
		problem := getFamilyProblem(t, theirSlug, "")
		require.Equal(t, "GetLicenseFamily.NotFound", problem.Code)
	})

	t.Run("CreatingAVersionInItReportsItMissing", func(t *testing.T) {
		for name, target := range map[string]map[string]any{
			"ByID":   {"familyId": theirs.FamilyID},
			"BySlug": {"familySlug": theirSlug},
		} {
			t.Run(name, func(t *testing.T) {
				body := map[string]any{
					"name":        "Joined from outside",
					"description": "Must not join another organization's family",
					"type":        "PAID",
					"isDefault":   false,
				}
				for key, value := range target {
					body[key] = value
				}
				problem := sendLicenseWrite(t, http.MethodPost, "/api/licenses", body, fiber.StatusNotFound)
				require.Equal(t, "CreateLicense.FamilyNotFound", problem.Code)
			})
		}
	})

	t.Run("TransitionsReportItsVersionsMissing", func(t *testing.T) {
		for op, code := range map[string]string{
			"archive":   "ArchiveLicense.NotFound",
			"unarchive": "UnarchiveLicense.NotFound",
			"publish":   "PublishLicense.NotFound",
		} {
			problem := transition[kaitenerrors.Problem](t, theirs.Slug, op, fiber.StatusNotFound)
			require.Equal(t, code, problem.Code)
		}
	})

	// The backstop for a write path that would forget the filter: the
	// composite key refuses a version whose organization is not its family's.
	t.Run("TheDatabaseRefusesAVersionInAnotherOrganizationsFamily", func(t *testing.T) {
		_, err := testServer.Dependencies.DB.Exec(t.Context(),
			`INSERT INTO "license" ("name", "slug", "description", "type", "is_default", "lifecycle_state", "organization_id", "family_id")
			 VALUES ('Smuggled', 'smuggled-version', 'Crosses organizations', 'PAID', FALSE, 'PUBLISHED', $1, $2)`,
			testDb.DefaultData.OrganizationID, theirs.FamilyID)

		var pgErr *pgconn.PgError
		require.ErrorAs(t, err, &pgErr)
		require.Equal(t, "license_family_id_fkey", pgErr.ConstraintName)
	})
}

// newNeighbourOrganization creates a second organization, with the default
// user as a member so that membership-joined writes would not be what refuses.
func newNeighbourOrganization(t *testing.T) uuid.UUID {
	t.Helper()

	organizationID := uuid.New()
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO organization (id, external_id, name)
		VALUES ($1, $2, 'Neighbour Organization')
	`, organizationID, "organization-external-"+organizationID.String())
	require.NoError(t, err)

	_, err = testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO user_on_organization (organization_id, user_id)
		VALUES ($1, $2)
	`, organizationID, testDb.DefaultData.UserID)
	require.NoError(t, err)

	return organizationID
}
