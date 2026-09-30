package featureflags_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/client"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/manifest/getmanifest"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetManifest(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	// createFlag creates a feature flag via the API and returns it.
	createFlag := func(t *testing.T, ff schema.FeatureFlag) schema.FeatureFlag {
		t.Helper()
		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", ff)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		return commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusCreated)
	}

	// getManifest calls GET /api/openfeature/v0/manifest.
	getManifest := func(t *testing.T) (getmanifest.ManifestEnvelope, *client.Response) {
		t.Helper()
		req := httptest.NewRequest("GET", "/api/openfeature/v0/manifest", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		result := commonfixture.AssertJSONResponse[getmanifest.ManifestEnvelope](t, resp, fiber.StatusOK)
		defer commonfixture.MustCloseBody(t, resp.Body)
		return result, &client.Response{}
	}

	t.Run("WhenNoFlagsExist_ReturnsEmptyManifest", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Act
		req := httptest.NewRequest("GET", "/api/openfeature/v0/manifest", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		result := commonfixture.AssertJSONResponse[getmanifest.ManifestEnvelope](t, resp, fiber.StatusOK)
		require.NotNil(t, result.Flags)
		require.Empty(t, result.Flags)
	})

	t.Run("WhenAllFlagsLackFallbackValue_ReturnsEmptyManifest", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		createFlag(t, schema.FeatureFlag{
			Name: "No Fallback Flag", Slug: "no-fallback", Type: "boolean",
			Variants:       []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
			Metadata:       map[string]any{"team": "platform"}, // no fallback_value
			Enabled:        true, EventName: "ff.no_fallback",
		})
		createFlag(t, schema.FeatureFlag{
			Name: "Also No Fallback", Slug: "also-no-fallback", Type: "string",
			Variants:       []schema.Variant{{Name: "v1", Value: "one"}, {Name: "v2", Value: "two"}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("v1")},
			Metadata:       map[string]any{},
			Enabled:        true, EventName: "ff.also_no_fallback",
		})

		// Act
		result, _ := getManifest(t)

		// Assert
		require.Empty(t, result.Flags)
	})

	t.Run("WhenFlagHasFallbackValue_AppearsInManifest", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		created := createFlag(t, schema.FeatureFlag{
			Name:        "Beta Feature",
			Slug:        "beta-feature",
			Type:        "boolean",
			Description: strPtr("Enables the beta feature set"),
			Variants:    []schema.Variant{{Name: "enabled", Value: true}, {Name: "disabled", Value: false}},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Beta users", "user.beta == 'true'", "enabled"),
			},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
			Metadata:       map[string]any{"fallback_value": false},
			Enabled:        true,
			EventName:      "ff.beta_feature",
		})

		// Act
		result, _ := getManifest(t)

		// Assert
		require.Len(t, result.Flags, 1)
		flag := result.Flags[0]
		require.Equal(t, created.Slug, flag.Key)
		require.Equal(t, created.Name, flag.Name)
		require.Equal(t, created.Type, flag.Type)
		require.Equal(t, false, flag.DefaultValue)
	})

	t.Run("WhenMixedFlags_ReturnsOnlyFlagsWithFallbackValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Flag WITH fallback_value — should appear
		createFlag(t, schema.FeatureFlag{
			Name: "Rate Limit", Slug: "rate-limit", Type: "number",
			Variants:       []schema.Variant{{Name: "free", Value: float64(100)}, {Name: "pro", Value: float64(5000)}},
			Targetings:     schema.Targetings{schema.NewBasicTargeting("Pro plan", "user.plan == 'pro'", "pro")},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("free")},
			Metadata:       map[string]any{"fallback_value": float64(100)},
			Enabled:        true, EventName: "ff.rate_limit",
		})
		// Flag WITHOUT fallback_value — should NOT appear
		createFlag(t, schema.FeatureFlag{
			Name: "Log Level", Slug: "log-level", Type: "string",
			Variants:       []schema.Variant{{Name: "info", Value: "info"}, {Name: "debug", Value: "debug"}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("info")},
			Metadata:       map[string]any{"category": "observability"},
			Enabled:        true, EventName: "ff.log_level",
		})
		// Another flag WITH fallback_value — should appear
		createFlag(t, schema.FeatureFlag{
			Name: "UI Theme", Slug: "ui-theme", Type: "string",
			Variants:       []schema.Variant{{Name: "light", Value: "light"}, {Name: "dark", Value: "dark"}},
			Targetings:     schema.Targetings{schema.NewBasicTargeting("Dark pref", "user.theme == 'dark'", "dark")},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("light")},
			Metadata:       map[string]any{"fallback_value": "light"},
			Enabled:        true, EventName: "ff.ui_theme",
		})

		// Act
		result, _ := getManifest(t)

		// Assert: exactly the two flags with fallback_value
		require.Len(t, result.Flags, 2)

		keys := make(map[string]bool, len(result.Flags))
		for _, f := range result.Flags {
			keys[f.Key] = true
		}
		require.True(t, keys["rate-limit"], "rate-limit should be in manifest")
		require.True(t, keys["ui-theme"], "ui-theme should be in manifest")
		require.False(t, keys["log-level"], "log-level should NOT be in manifest")
	})

	t.Run("ManifestFlagFields_AreCorrectlyMapped", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		desc := "Controls the application colour theme"
		createFlag(t, schema.FeatureFlag{
			Name:        "Theme Flag",
			Slug:        "theme-flag",
			Type:        "string",
			Description: &desc,
			Variants:    []schema.Variant{{Name: "light", Value: "light"}, {Name: "dark", Value: "dark"}},
			Targetings:  schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("light"),
			},
			Metadata:  map[string]any{"fallback_value": "light"},
			Enabled:   true,
			EventName: "ff.theme",
		})

		// Act
		result, _ := getManifest(t)

		// Assert each field on the ManifestFlag
		require.Len(t, result.Flags, 1)
		mf := result.Flags[0]
		require.Equal(t, "theme-flag", mf.Key)
		require.Equal(t, "Theme Flag", mf.Name)
		require.Equal(t, "string", mf.Type)
		require.NotNil(t, mf.Description)
		require.Equal(t, desc, *mf.Description)
		require.Equal(t, "light", mf.DefaultValue)
	})

	t.Run("WhenFallbackValueIsObject_DefaultValueIsPreserved", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		limits := map[string]any{"max_projects": float64(3), "max_seats": float64(1)}
		createFlag(t, schema.FeatureFlag{
			Name: "Feature Limits", Slug: "feature-limits", Type: "object",
			Variants: []schema.Variant{
				{Name: "community", Value: map[string]any{"max_projects": 3, "max_seats": 1}},
				{Name: "pro", Value: map[string]any{"max_projects": 50, "max_seats": 25}},
			},
			Targetings:     schema.Targetings{schema.NewBasicTargeting("Pro", "user.plan == 'pro'", "pro")},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("community")},
			Metadata:       map[string]any{"fallback_value": limits},
			Enabled:        true, EventName: "ff.feature_limits",
		})

		// Act
		result, _ := getManifest(t)

		// Assert
		require.Len(t, result.Flags, 1)
		mf := result.Flags[0]
		require.Equal(t, "feature-limits", mf.Key)
		// JSON round-trip serialises object as map[string]any
		defaultMap, ok := mf.DefaultValue.(map[string]any)
		require.True(t, ok, "DefaultValue should be a map")
		require.Equal(t, float64(3), defaultMap["max_projects"])
		require.Equal(t, float64(1), defaultMap["max_seats"])
	})

	t.Run("ResponseHeader_XManifestCapabilities_IsRead", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Act
		req := httptest.NewRequest("GET", "/api/openfeature/v0/manifest", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.Equal(t, "read", resp.Header.Get("X-Manifest-Capabilities"))
	})
}

func strPtr(s string) *string { return &s }
