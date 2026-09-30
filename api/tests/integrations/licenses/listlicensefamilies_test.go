package licenses_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func listFamilies(t *testing.T, query string) pagination.Page[*schema.LicenseFamilyView] {
	t.Helper()

	req := httptest.NewRequest("GET", "/api/license-families"+query, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[pagination.Page[*schema.LicenseFamilyView]](t, resp, fiber.StatusOK)
}

func familyBySlug(t *testing.T, page pagination.Page[*schema.LicenseFamilyView], slug string) *schema.LicenseFamilyView {
	t.Helper()
	for _, family := range page.Items {
		if family.Slug == slug {
			return family
		}
	}
	t.Fatalf("family %q not in the page", slug)
	return nil
}

func TestListLicenseFamilies(t *testing.T) {
	t.Run("WhenNoFamilyExists_ReturnsAnEmptyPage", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		page := listFamilies(t, "")

		require.Empty(t, page.Items)
		require.False(t, page.HasMore)
		require.Nil(t, page.NextCursor)
	})

	t.Run("WhenOneVersionExists_ResolvesItAsTheCurrentVersion", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		license, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Solo Product",
			Slug:        ptr.To("solo-product"),
			Description: "One version, published",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		family := familyBySlug(t, listFamilies(t, ""), "solo-product")

		require.Equal(t, int32(1), family.VersionCount)
		require.NotNil(t, family.CurrentVersion)
		require.Equal(t, license.Slug, family.CurrentVersion.Slug)
		require.Equal(t, schema.Published, family.CurrentVersion.LifecycleState)
		require.Empty(t, family.Versions, "versions are only returned by the family endpoint's include=versions")
	})

	// The rule that matters: a vendor whose default is v2 while v3 is already
	// published is telling the catalogue to keep selling v2. Resolving to the
	// highest published version would override that.
	t.Run("WhenTheDefaultIsNotTheHighestVersion_ResolvesTheDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "held-back"

		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Held Back",
			Slug:        ptr.To(familySlug),
			Description: "Version 1",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		second, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Held Back",
			FamilySlug:  ptr.To(familySlug),
			Description: "Version 2, the default",
			Type:        schema.Paid,
			IsDefault:   true,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		_, err = repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Held Back",
			FamilySlug:  ptr.To(familySlug),
			Description: "Version 3, published but not the default",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		family := familyBySlug(t, listFamilies(t, ""), familySlug)

		require.Equal(t, int32(3), family.VersionCount)
		require.NotNil(t, family.CurrentVersion)
		require.Equal(t, second.Slug, family.CurrentVersion.Slug,
			"the family's default wins over the highest published version")
		require.Equal(t, "2", family.CurrentVersion.Version)
	})

	t.Run("WhenNoVersionIsPublished_ListsTheFamilyWithoutACurrentVersion", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:           "Draft Only",
			Slug:           ptr.To("draft-only"),
			Description:    "Never published",
			Type:           schema.Paid,
			LifecycleState: schema.Draft,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		family := familyBySlug(t, listFamilies(t, ""), "draft-only")

		require.Equal(t, int32(1), family.VersionCount,
			"versionCount counts the product's history, not what is for sale")
		require.Nil(t, family.CurrentVersion,
			"a draft-only family stays listed so a console can render it as such")
	})

	t.Run("WhenEveryVersionIsArchived_ListsTheFamilyWithoutACurrentVersion", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:           "Withdrawn",
			Slug:           ptr.To("withdrawn"),
			Description:    "Taken off sale",
			Type:           schema.Paid,
			LifecycleState: schema.Archived,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		family := familyBySlug(t, listFamilies(t, ""), "withdrawn")

		require.Equal(t, int32(1), family.VersionCount)
		require.Nil(t, family.CurrentVersion)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const total = 5
		expected := make(map[string]bool, total)
		for i := range total {
			slug := "paged-family-" + string(rune('a'+i))
			_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
				Name:        "Paged Family " + string(rune('A'+i)),
				Slug:        ptr.To(slug),
				Description: "One of several families",
				Type:        schema.Paid,
			}, testDb.DefaultData.OrganizationID)
			require.NoError(t, err)
			expected[slug] = false
		}

		seen := make(map[string]int, total)
		query := "?limit=2"
		for pages := 0; ; pages++ {
			require.Less(t, pages, total+2, "the cursor walk did not terminate")

			page := listFamilies(t, query)
			for _, family := range page.Items {
				seen[family.Slug]++
			}
			if !page.HasMore {
				require.Nil(t, page.NextCursor)
				break
			}
			require.NotNil(t, page.NextCursor)
			query = "?limit=2&cursor=" + *page.NextCursor
		}

		require.Len(t, seen, total)
		for slug := range expected {
			require.Equal(t, 1, seen[slug], "family %q was seen %d times across the walk", slug, seen[slug])
		}
	})
}
