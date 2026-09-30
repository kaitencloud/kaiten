package licenses_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/archivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/lifecycletransition"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func getFamily(t *testing.T, familySlug, query string) *schema.LicenseFamilyView {
	t.Helper()

	req := httptest.NewRequest("GET", "/api/license-families/"+familySlug+query, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[*schema.LicenseFamilyView](t, resp, fiber.StatusOK)
}

func getFamilyProblem(t *testing.T, familySlug, query string) kaitenerrors.Problem {
	t.Helper()

	req := httptest.NewRequest("GET", "/api/license-families/"+familySlug+query, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusNotFound)
}

// publishVersionInFamily adds a published version to an existing family and
// returns it.
func publishVersionInFamily(t *testing.T, name, familySlug, description string) *schema.License {
	t.Helper()

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	license, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        name,
		FamilySlug:  ptr.To(familySlug),
		Description: description,
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	return license
}

// archiveVersion archives a version the way POST /licenses/{slug}/archive
// does, without going through HTTP.
func archiveVersion(t *testing.T, license *schema.License) {
	t.Helper()

	repo := lifecycletransition.NewRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	_, err := repo.Apply(t.Context(), archivelicense.Transition, license.Slug,
		testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
}

func TestGetLicenseFamily(t *testing.T) {
	// The family address is what a consumer
	// holds, so publishing a version has to change what that address answers
	// without the consumer touching anything -- while the version it replaces
	// stays reachable by its own slug, because pinned access is meant to stay
	// pinned.
	t.Run("WhenANewVersionIsPublished_TheFamilyResolvesToItAndTheOldOneStaysReachable", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "shifting"

		first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Shifting",
			Slug:        ptr.To(familySlug),
			Description: "Version 1",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		before := getFamily(t, familySlug, "")
		require.NotNil(t, before.CurrentVersion)
		require.Equal(t, "1", before.CurrentVersion.Version)

		second := publishVersionInFamily(t, "Shifting", familySlug, "Version 2")

		after := getFamily(t, familySlug, "")
		require.NotNil(t, after.CurrentVersion)
		require.Equal(t, "2", after.CurrentVersion.Version,
			"the same family address now answers with the newly published version")
		require.Equal(t, second.Slug, after.CurrentVersion.Slug)
		require.Equal(t, int32(2), after.VersionCount)

		// v1 by its own slug, unchanged.
		req := httptest.NewRequest("GET", "/api/licenses/"+first.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		pinned := commonfixture.AssertJSONResponse[*schema.License](t, resp, fiber.StatusOK)
		require.Equal(t, "1", pinned.Version, "version-row addressing is untouched by family resolution")
	})

	// Minus the public catalogue half, which
	// ships with the billing train.
	t.Run("WhenTheOnlyPublishedVersionIsArchived_ReturnsTheExplicitCode", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "sunset"

		only, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Sunset",
			Slug:        ptr.To(familySlug),
			Description: "The only version",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		require.NotNil(t, getFamily(t, familySlug, "").CurrentVersion)

		archiveVersion(t, only)

		problem := getFamilyProblem(t, familySlug, "")
		require.Equal(t, "GetLicenseFamily.NoPublishedVersion", problem.Code)
		require.Contains(t, problem.Detail, familySlug,
			"the family metadata rides in the detail: Problem has no member for structured extras")

		// Still addressable as a version, and still visible in the list -- which is
		// where a console gets the structured version of this state.
		require.Equal(t, "1", getFamily(t, familySlug, "?version=1").CurrentVersion.Version)

		// And still readable as a family by anyone asking for the history, which
		// is the read that answers *why* there is no current version. This 404ed
		// at first: resolution ran before the version list and its failure took
		// the whole response with it.
		withVersions := getFamily(t, familySlug, "?include=versions")
		require.Nil(t, withVersions.CurrentVersion, "nothing is published, so nothing resolves")
		require.Len(t, withVersions.Versions, 1)
		require.Equal(t, schema.Archived, withVersions.Versions[0].LifecycleState)
		require.Equal(t, int32(1), withVersions.VersionCount)
	})

	// A family whose every version is a draft has never had a current version,
	// as opposed to having lost one. Same answer: readable with the history,
	// 404 without it.
	t.Run("WhenEveryVersionIsADraft_TheHistoryIsStillReadable", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "never-published"

		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:           "Never Published",
			Slug:           ptr.To(familySlug),
			Description:    "Version 1, still being written",
			Type:           schema.Paid,
			LifecycleState: schema.Draft,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		require.Equal(t, "GetLicenseFamily.NoPublishedVersion",
			getFamilyProblem(t, familySlug, "").Code)

		withVersions := getFamily(t, familySlug, "?include=versions")
		require.Nil(t, withVersions.CurrentVersion)
		require.Len(t, withVersions.Versions, 1)
		require.Equal(t, schema.Draft, withVersions.Versions[0].LifecycleState)
	})

	// A version being prepared must not become
	// what the catalogue serves just by existing.
	t.Run("WhenADraftIsNewerThanThePublishedVersion_ResolvesThePublishedOne", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "in-preparation"

		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "In Preparation",
			Slug:        ptr.To(familySlug),
			Description: "Version 1, published",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		second := publishVersionInFamily(t, "In Preparation", familySlug, "Version 2, published")

		_, err = repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:           "In Preparation",
			FamilySlug:     ptr.To(familySlug),
			Description:    "Version 3, still a draft",
			Type:           schema.Paid,
			LifecycleState: schema.Draft,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		family := getFamily(t, familySlug, "")

		require.NotNil(t, family.CurrentVersion)
		require.Equal(t, "2", family.CurrentVersion.Version,
			"a draft newer than the published version must not be what the family serves")
		require.Equal(t, second.Slug, family.CurrentVersion.Slug)
		require.Equal(t, int32(3), family.VersionCount, "the draft still counts as part of the product's history")
	})

	t.Run("WhenVersionIsRequested_ReturnsItEvenArchived", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "historical"

		first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Historical",
			Slug:        ptr.To(familySlug),
			Description: "Version 1, to be archived",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		publishVersionInFamily(t, "Historical", familySlug, "Version 2, the live one")
		archiveVersion(t, first)

		archived := getFamily(t, familySlug, "?version=1")
		require.NotNil(t, archived.CurrentVersion)
		require.Equal(t, "1", archived.CurrentVersion.Version)
		require.Equal(t, schema.Archived, archived.CurrentVersion.LifecycleState,
			"explicit access does not filter on lifecycle state")

		// While the unqualified read still resolves the live version.
		require.Equal(t, "2", getFamily(t, familySlug, "").CurrentVersion.Version)
	})

	t.Run("WhenIncludeVersionsIsRequested_ReturnsTheWholeHistory", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "lifecycle-view"

		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Lifecycle View",
			Slug:        ptr.To(familySlug),
			Description: "Version 1",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		publishVersionInFamily(t, "Lifecycle View", familySlug, "Version 2")
		_, err = repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:           "Lifecycle View",
			FamilySlug:     ptr.To(familySlug),
			Description:    "Version 3, draft",
			Type:           schema.Paid,
			LifecycleState: schema.Draft,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		withVersions := getFamily(t, familySlug, "?include=versions")

		require.Len(t, withVersions.Versions, 3)
		require.Equal(t, []string{"1", "2", "3"}, []string{
			withVersions.Versions[0].Version,
			withVersions.Versions[1].Version,
			withVersions.Versions[2].Version,
		}, "oldest first")
		require.Equal(t, schema.Draft, withVersions.Versions[2].LifecycleState)

		require.Empty(t, getFamily(t, familySlug, "").Versions,
			"the history is only returned when asked for")
	})

	t.Run("WhenTheFamilyDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		problem := getFamilyProblem(t, "no-such-family", "")
		require.Equal(t, "GetLicenseFamily.NotFound", problem.Code)
	})

	// include is a list, so that a representation can be added later without
	// changing the parameter's type. The history's length is the count.
	t.Run("IncludeTakesACommaSeparatedList", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "listed"
		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Listed",
			Slug:        ptr.To(familySlug),
			Description: "Version 1",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		publishVersionInFamily(t, "Listed", familySlug, "Version 2")

		family := getFamily(t, familySlug, "?include=versions,versions")
		require.Len(t, family.Versions, 2)
		require.Equal(t, int32(2), family.VersionCount)
		require.Equal(t, "2", family.CurrentVersion.Version)
	})

	t.Run("WhenIncludeNamesAnUnknownRepresentation_Returns422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		req := httptest.NewRequest("GET", "/api/license-families/anything?include=versions,prices", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
	})

	t.Run("WhenTheVersionDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Short History",
			Slug:        ptr.To("short-history"),
			Description: "Only one version",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		problem := getFamilyProblem(t, "short-history", "?version=7")
		require.Equal(t, "GetLicenseFamily.VersionNotFound", problem.Code)
	})
}
