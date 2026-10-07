package licenses_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicense"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestCreateLicense_OpensAFamilyNamedAfterTheLicense pins what a create with no
// familySlug does to the family table: exactly one row, carrying the license's
// own slug, with the license pointing at it.
func TestCreateLicense_OpensAFamilyNamedAfterTheLicense(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	license, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Opens A Family",
		Slug:        ptr.To("opens-a-family"),
		Description: "First version of a new product",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, "1", license.Version)

	familyID, familySlug := familyOfLicense(t, license.Slug)
	require.Equal(t, "opens-a-family", familySlug,
		"at version 1 the family and the license address the same thing, so they share a slug")
	require.Equal(t, 1, countFamilies(t), "one create, one family")
	require.NotEqual(t, uuid.Nil, familyID)
}

// TestCreateLicense_DefaultMovesToTheNewVersionOfTheFamily covers the create
// path's half of the one-default-per-family rule: publishing a new default
// version takes the flag off the version that held it.
func TestCreateLicense_DefaultMovesToTheNewVersionOfTheFamily(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Moving Default",
		Slug:        ptr.To("moving-default"),
		Description: "Version 1, the default",
		Type:        schema.Paid,
		IsDefault:   true,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.True(t, first.IsDefault)

	second, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Moving Default",
		FamilySlug:  ptr.To("moving-default"),
		Description: "Version 2, the new default",
		Type:        schema.Paid,
		IsDefault:   true,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.True(t, second.IsDefault)
	require.Equal(t, "2", second.Version)

	require.False(t, isDefault(t, first.Slug), "the previous default is switched off by the family-keyed unset")
	require.Equal(t, 1, countDefaultsInFamily(t, second.Slug))
}

// A family is the set of rows sharing family_id, not (name, organization_id).
// Keyed on the name, renaming one version would move it out of its own family:
// the next version would restart numbering at 1, is_default management would
// stop seeing it, and the catalogue would render one product as two.
func TestLicenseFamily_RenamingAVersionDoesNotDetachIt(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	updateRepo := updatelicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	const familySlug = "pro"

	first, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Pro",
		Slug:        ptr.To(familySlug),
		Description: "Pro v1",
		Type:        schema.Paid,
		IsDefault:   true,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	second, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Pro",
		FamilySlug:  ptr.To(familySlug),
		Description: "Pro v2",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, "2", second.Version)

	familyBefore, _ := familyOfLicense(t, second.Slug)

	// The rename. Nothing about it is special-cased any more: name is a column
	// the caller may set to whatever it likes.
	_, err = updateRepo.UpdateLicense(t.Context(), &updatelicense.Command{
		Name:        "Professional",
		Description: second.Description,
		Type:        second.Type,
		Version:     second.Version,
		VersionName: second.VersionName,
		IsDefault:   false,
	}, second.Slug, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	third, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Professional",
		FamilySlug:  ptr.To(familySlug),
		Description: "The version published after the rename",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	require.Equal(t, "3", third.Version,
		"the family sequence continues across the rename -- restarting at 1 is the detachment this test exists to catch")

	familyAfterRename, _ := familyOfLicense(t, second.Slug)
	familyOfThird, _ := familyOfLicense(t, third.Slug)
	require.Equal(t, familyBefore, familyAfterRename, "renaming a version does not move it between families")
	require.Equal(t, familyBefore, familyOfThird, "the version published after the rename joins the same family")

	require.True(t, isDefault(t, first.Slug),
		"the rename left the family's default alone: nothing about it was keyed on the name")
	require.Equal(t, 1, countDefaultsInFamily(t, first.Slug))
}

// TestLicenseFamily_TwoFamiliesCanShareAName pins the last piece of "name is
// a freely editable display label".
// license_name_version_organization_id_key -- the pre-family key -- made this
// a 409 while it existed: every family starts at version 1, so two families
// could not share a name at all. 20261007000000_license_family.sql drops it.
// Two products may share a display name, and only family_id says which rows
// are the same product.
func TestLicenseFamily_TwoFamiliesCanShareAName(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Shared Name",
		Slug:        ptr.To("shared-name-first"),
		Description: "First family",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	second, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Shared Name",
		Slug:        ptr.To("shared-name-second"),
		Description: "A genuinely different product that happens to share a display name",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err, "a shared display name is not a conflict once the family carries identity")

	require.Equal(t, "1", first.Version)
	require.Equal(t, "1", second.Version, "each family numbers its own versions")
	require.NotEqual(t, first.FamilyID, second.FamilyID, "same name, two products")
	require.Equal(t, 2, countFamilies(t))
}

// TestLicenseFamily_RenamingOntoAnotherFamilysNameIsAllowed is the update side
// of the same rule. A rename used to fail with UpdateLicense.NameVersionConflict
// whenever the target name already carried this version number in another
// family; with the key gone it is a label change, and the family is what still
// tells the two products apart.
func TestLicenseFamily_RenamingOntoAnotherFamilysNameIsAllowed(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	updateRepo := updatelicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	alpha, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Alpha",
		Slug:        ptr.To("alpha"),
		Description: "Family A, version 1",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	beta, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Beta",
		Slug:        ptr.To("beta"),
		Description: "Family B, version 1",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	renamed, err := updateRepo.UpdateLicense(t.Context(), &updatelicense.Command{
		Name:        alpha.Name,
		Description: beta.Description,
		Type:        beta.Type,
		Version:     beta.Version,
		VersionName: beta.VersionName,
		IsDefault:   false,
	}, beta.Slug, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err, "renaming onto a name another family holds at the same version is allowed")

	require.Equal(t, alpha.Name, renamed.Name)
	require.Equal(t, beta.FamilyID, renamed.FamilyID, "a rename changes the label, never the family")
	require.NotEqual(t, alpha.FamilyID, renamed.FamilyID)
}

// ── helpers ────────────────────────────────────────────────────────────────

// familyOfLicense returns the family id and slug of the license with this slug.
// The family slug is not on the license DTO by design (exposes familyId
// there and the slug through the GraphQL family field), so tests that care about
// it read the join.
func familyOfLicense(t *testing.T, licenseSlug string) (uuid.UUID, string) {
	t.Helper()
	var id uuid.UUID
	var slug string
	err := testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT f."id", f."slug"
		 FROM "license" l JOIN "license_family" f ON f."id" = l."family_id"
		 WHERE l."slug" = $1 AND l."organization_id" = $2`,
		licenseSlug, testDb.DefaultData.OrganizationID).Scan(&id, &slug)
	require.NoError(t, err)
	return id, slug
}

func countFamilies(t *testing.T) int {
	t.Helper()
	var count int
	err := testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT count(*) FROM "license_family" WHERE "organization_id" = $1`,
		testDb.DefaultData.OrganizationID).Scan(&count)
	require.NoError(t, err)
	return count
}

func isDefault(t *testing.T, licenseSlug string) bool {
	t.Helper()
	var value bool
	err := testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT "is_default" FROM "license" WHERE "slug" = $1 AND "organization_id" = $2`,
		licenseSlug, testDb.DefaultData.OrganizationID).Scan(&value)
	require.NoError(t, err)
	return value
}

// countDefaultsInFamily counts the default versions of the family the given
// license belongs to. The partial unique index makes anything but 0 or 1
// unreachable, which is exactly why it is worth asserting.
func countDefaultsInFamily(t *testing.T, licenseSlug string) int {
	t.Helper()
	var count int
	err := testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT count(*)
		 FROM "license" sibling
		 WHERE sibling."is_default"
		   AND sibling."family_id" = (SELECT l."family_id" FROM "license" l
		                              WHERE l."slug" = $1 AND l."organization_id" = $2)`,
		licenseSlug, testDb.DefaultData.OrganizationID).Scan(&count)
	require.NoError(t, err)
	return count
}

// TestCreateLicense_JoinsAFamilyByID pins the identifier form of familySlug.
// A license's representation carries familyId and not its family's slug (that
// is served by the family endpoints), so a console holding a license names its
// family the way an instance names its license: by id.
func TestCreateLicense_JoinsAFamilyByID(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "By Identifier",
		Slug:        ptr.To("by-identifier"),
		Description: "Version 1",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	second, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "By Identifier",
		FamilyID:    &first.FamilyID,
		Description: "Version 2, named by id",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	require.Equal(t, "2", second.Version)
	require.Equal(t, first.FamilyID, second.FamilyID)
	require.Equal(t, "by-identifier-v2", second.Slug,
		"the derived slug comes from the family's own slug, whichever handle named the family")
	require.Equal(t, 1, countFamilies(t), "naming a family by id adds a version to it, it does not open one")
}

// TestCreateLicense_FamilyIDAndSlugMustAgree covers the one way the two
// handles can be combined wrongly. Silently preferring one over the other
// would let a caller add a version to a product it did not mean.
func TestCreateLicense_FamilyIDAndSlugMustAgree(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Agree A",
		Slug:        ptr.To("agree-a"),
		Description: "Family A",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	_, err = repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Agree B",
		Slug:        ptr.To("agree-b"),
		Description: "Family B",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	_, err = repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Agree A",
		FamilyID:    &first.FamilyID,
		FamilySlug:  ptr.To("agree-b"),
		Description: "Names two different families",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)

	var kerr *kaitenerrors.Error
	require.ErrorAs(t, err, &kerr)
	require.Equal(t, "CreateLicense.FamilyMismatch", kerr.Code)
	require.Equal(t, kaitenerrors.KindUnprocessable, kerr.Kind)

	// Two handles that agree are merely redundant.
	agreed, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Agree A",
		FamilyID:    &first.FamilyID,
		FamilySlug:  ptr.To("agree-a"),
		Description: "Names one family twice",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, first.FamilyID, agreed.FamilyID)
	require.Equal(t, "2", agreed.Version)
}

// TestCreateLicense_UnknownFamilyIDIsRejected mirrors
// TestCreateLicense_UnknownFamilyIsRejected for the identifier form.
func TestCreateLicense_UnknownFamilyIDIsRejected(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	unknown := uuid.New()

	_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Orphan By Id",
		FamilyID:    &unknown,
		Description: "Targets a family id that does not exist",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)

	var kerr *kaitenerrors.Error
	require.ErrorAs(t, err, &kerr)
	require.Equal(t, "CreateLicense.FamilyNotFound", kerr.Code)
	require.Equal(t, kaitenerrors.KindNotFound, kerr.Kind)
}

// TestLicenseFamily_ADeletedVersionsNumberIsNotReused pins the family's version
// counter. Numbers used to be MAX(version) + 1 over the versions left, so
// deleting the highest one handed its number -- and the {familySlug}-v{n} slug
// built from it -- to the next version, and ?version=N or a stored slug then
// addressed a different row without anything saying so.
func TestLicenseFamily_ADeletedVersionsNumberIsNotReused(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	const familySlug = "counted-family"
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	create := func(command *createlicense.Command) *schema.License {
		t.Helper()
		command.Name = "Counted Family"
		command.Description = "A version of a family that loses its newest one"
		command.Type = schema.Paid
		license, err := repo.CreateLicense(t.Context(), command, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		return license
	}

	create(&createlicense.Command{Slug: ptr.To(familySlug)})
	create(&createlicense.Command{FamilySlug: ptr.To(familySlug)})
	third := create(&createlicense.Command{
		FamilySlug:     ptr.To(familySlug),
		LifecycleState: schema.Draft,
	})
	require.Equal(t, "3", third.Version)
	require.Equal(t, familySlug+"-v3", third.Slug)

	req := httptest.NewRequest(http.MethodDelete, "/api/licenses/"+third.Slug, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

	next := create(&createlicense.Command{FamilySlug: ptr.To(familySlug)})
	require.Equal(t, "4", next.Version, "a deleted version's number stays spent")
	require.Equal(t, familySlug+"-v4", next.Slug, "and so does the slug built from it")

	problem := getFamilyProblem(t, familySlug, "?version=3")
	require.Equal(t, "GetLicenseFamily.VersionNotFound", problem.Code)
}
