package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestLicenseFamilyVisibility(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newVersion(t, "Pro", licenseschema.Published)
	families := commonfixture.AssertJSONResponse[pagination.Page[licenseschema.LicenseFamilyView]](t,
		call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
	require.Len(t, families.Items, 1)
	family := families.Items[0]
	require.False(t, family.IsPublic, "private by default")

	made := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t,
		call(t, "PATCH", "/api/license-families/"+family.Slug, map[string]any{"isPublic": true}), fiber.StatusOK)
	require.True(t, made.IsPublic)
	read := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t,
		call(t, "GET", "/api/license-families/"+family.Slug, nil), fiber.StatusOK)
	require.True(t, read.IsPublic)
	require.Equal(t, "UpdateLicenseFamily.NotFound", problemCode(t, fiber.StatusNotFound, "PATCH",
		"/api/license-families/nope", map[string]any{"isPublic": true}))
}
