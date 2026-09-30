package featureflags_test

import (
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetFeatureFlags(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	createFeatureFlag := func(t *testing.T, name, slug, eventName string) schema.FeatureFlag {
		t.Helper()

		payload := schema.FeatureFlag{
			Name: name,
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true, Description: "Enabled variant"},
				{Name: "disabled", Value: false, Description: "Disabled variant"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Default", "true", "enabled"),
			},
			Description:    nil,
			Metadata:       map[string]any{},
			Enabled:        true,
			EventName:      eventName,
			Slug:           slug,
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		return commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusCreated)
	}

	t.Run("WhenNoFeatureFlagsExist_ReturnsEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.FeatureFlag]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenOneFeatureFlagExists_ReturnsThatFeatureFlag", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		created := createFeatureFlag(t, "Single flag", "single-flag", "schema.single")

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.FeatureFlag]](t, resp, fiber.StatusOK)
		flags := actual.Items
		require.Len(t, flags, 1)
		require.Equal(t, created.ID, flags[0].ID)
		require.Equal(t, created.Name, flags[0].Name)
		require.Equal(t, created.Slug, flags[0].Slug)
		require.Equal(t, created.EventName, flags[0].EventName)
	})

	t.Run("WhenMultipleFeatureFlagsExist_ReturnsAllFeatureFlags", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		flag1 := createFeatureFlag(t, "First flag", "first-flag", "schema.first")
		flag2 := createFeatureFlag(t, "Second flag", "second-flag", "schema.second")
		flag3 := createFeatureFlag(t, "Third flag", "third-flag", "schema.third")

		expectedIDs := map[string]bool{
			flag1.ID.String(): true,
			flag2.ID.String(): true,
			flag3.ID.String(): true,
		}

		expectedSlugs := map[string]bool{
			"first-flag":  true,
			"second-flag": true,
			"third-flag":  true,
		}

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.FeatureFlag]](t, resp, fiber.StatusOK)
		flags := actual.Items
		require.Len(t, flags, 3)
		require.False(t, actual.HasMore)

		// Verify all created flags are returned
		for _, flag := range flags {
			require.True(t, expectedIDs[flag.ID.String()], "Unexpected flag ID: %s", flag.ID.String())
			require.True(t, expectedSlugs[flag.Slug], "Unexpected flag Slug: %s", flag.Slug)
		}
	})

	t.Run("WhenFeatureFlagsHaveDifferentConfigurations_ReturnsAllWithCorrectData", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Create first flag with basic targeting
		_ = createFeatureFlag(t, "Basic flag", "basic-flag", "schema.basic")

		// Create second flag with different configuration
		complexPayload := schema.FeatureFlag{
			Name: "Complex flag",
			Type: "string",
			Variants: []schema.Variant{
				{Name: "variant-a", Value: "A", Description: "Variant A"},
				{Name: "variant-b", Value: "B", Description: "Variant B"},
				{Name: "variant-c", Value: "C", Description: "Variant C"},
			},
			Targetings: schema.Targetings{
				schema.NewRolloutPercentageTargeting("Distribution", "true", map[string]int64{
					"variant-a": 50,
					"variant-b": 30,
					"variant-c": 20,
				}),
			},
			Description:    nil,
			Metadata:       map[string]any{"environment": "production"},
			Enabled:        false,
			EventName:      "schema.complex",
			Slug:           "complex-flag",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("variant-a")},
		}

		complexReq := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", complexPayload)
		complexResp, err := testServer.App.Test(complexReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, complexResp.Body)
		commonfixture.AssertJSONResponse[schema.FeatureFlag](t, complexResp, fiber.StatusCreated)

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.FeatureFlag]](t, resp, fiber.StatusOK)
		flags := actual.Items
		require.Len(t, flags, 2)

		// Find each flag and verify its configuration
		var basicFlag, complexFlag *schema.FeatureFlag
		for i := range flags {
			switch flags[i].Slug {
			case "basic-flag":
				basicFlag = &flags[i]
			case "complex-flag":
				complexFlag = &flags[i]
			}
		}

		require.NotNil(t, basicFlag, "Basic flag should be present")
		require.NotNil(t, complexFlag, "Complex flag should be present")

		// Verify basic flag
		require.Equal(t, "Basic flag", basicFlag.Name)
		require.Equal(t, "boolean", basicFlag.Type)
		require.True(t, basicFlag.Enabled)
		require.Len(t, basicFlag.Variants, 2)

		// Verify complex flag
		require.Equal(t, "Complex flag", complexFlag.Name)
		require.Equal(t, "string", complexFlag.Type)
		require.False(t, complexFlag.Enabled)
		require.Len(t, complexFlag.Variants, 3)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)
		createFeatureFlag(t, "First flag", "first-flag", "schema.first")
		createFeatureFlag(t, "Second flag", "second-flag", "schema.second")
		createFeatureFlag(t, "Third flag", "third-flag", "schema.third")

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/feature-flags?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.FeatureFlag]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)
		flag1 := createFeatureFlag(t, "First flag", "first-flag", "schema.first")
		flag2 := createFeatureFlag(t, "Second flag", "second-flag", "schema.second")
		flag3 := createFeatureFlag(t, "Third flag", "third-flag", "schema.third")
		expected := []schema.FeatureFlag{flag1, flag2, flag3}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/feature-flags?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.FeatureFlag]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/feature-flags?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every flag exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.FeatureFlag]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.FeatureFlag{}, page1.Items...), page2.Items...)
		actualIDs := make([]string, len(combined))
		for i, f := range combined {
			actualIDs[i] = f.ID.String()
		}
		expectedIDs := make([]string, len(expected))
		for i, f := range expected {
			expectedIDs[i] = f.ID.String()
		}
		require.ElementsMatch(t, expectedIDs, actualIDs)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
