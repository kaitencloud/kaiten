package auth

import (
	"errors"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func createTestApp() *fiber.App {
	return fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			var kaitenErr *kaitenerrors.Error
			if errors.As(err, &kaitenErr) {
				return c.Status(kaitenErr.HTTPStatus()).JSON(fiber.Map{
					"error": kaitenErr.ErrorCode(),
					"msg":   kaitenErr.Error(),
				})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "internal_error",
				"msg":   err.Error(),
			})
		},
	})
}

func TestJWTMiddleware_Authorization(t *testing.T) {
	t.Run("WhenNoAuthorizationHeader_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenInvalidAuthorizationFormat_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "InvalidFormat token123")

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenInvalidJWT_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer invalid.jwt.token")

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenMissingSubClaim_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		// Create JWT without sub claim
		claims := jwt.MapClaims{
			"kaiten_external_org_id": "org_tmnt_hq",
			"scopes":                 []string{"read:feature_flags"},
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenMissingKaitenExternalOrgIdClaim_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		// Create JWT without kaiten_external_org_id claim
		claims := jwt.MapClaims{
			"sub":    "user_splinter",
			"scopes": []string{"read:feature_flags"},
			"iat":    time.Now().Unix(),
			"exp":    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenMissingScopesClaim_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		// Create JWT without scopes claim
		claims := jwt.MapClaims{
			"sub":                    "user_splinter",
			"kaiten_external_org_id": "org_tmnt_hq",
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenEmptySubClaim_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		// Create JWT with empty sub claim
		claims := jwt.MapClaims{
			"sub":                    "",
			"kaiten_external_org_id": "org_tmnt_hq",
			"scopes":                 []string{"read:feature_flags"},
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenEmptyKaitenExternalOrgIdClaim_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		// Create JWT with empty kaiten_external_org_id claim
		claims := jwt.MapClaims{
			"sub":                    "user_splinter",
			"kaiten_external_org_id": "",
			"scopes":                 []string{"read:feature_flags"},
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenScopesNotStringArray_ReturnUnauthorized", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		// Create JWT with scopes as mixed types
		claims := jwt.MapClaims{
			"sub":                    "user_splinter",
			"kaiten_external_org_id": "org_tmnt_hq",
			"scopes":                 []any{"read:feature_flags", 123}, // Mixed types
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("WhenValidJWT_SetIdentityInContext", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		var capturedIdentity *principal.Principal

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			var ok bool
			capturedIdentity, ok = principal.FromContext(c.Context())
			require.True(t, ok)
			return c.SendStatus(fiber.StatusOK)
		})

		// Create valid JWT
		expectedScopes := []string{"read:feature_flags", "control_plan"}

		claims := jwt.MapClaims{
			"sub":                    "user_splinter",
			"kaiten_external_org_id": "org_tmnt_hq",
			"scopes":                 expectedScopes,
			"email":                  "user@example.com",
			"name":                   "Example User",
			"kaiten_org_name":        "Example Organization",
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.NotNil(t, capturedIdentity)
		assert.Equal(t, expectedScopes, capturedIdentity.Scopes)
		assert.Equal(t, tokenString, capturedIdentity.Token)
		assert.Equal(t, uuid.Nil, capturedIdentity.UserID)
		assert.Equal(t, uuid.Nil, capturedIdentity.OrganizationID)
		assert.Equal(t, "user_splinter", capturedIdentity.Provisioning.Subject)
		assert.Equal(t, "org_tmnt_hq", capturedIdentity.Provisioning.ExternalOrganizationID)
		assert.Equal(t, "user@example.com", capturedIdentity.Provisioning.Email)
		assert.Equal(t, "Example User", capturedIdentity.Provisioning.Name)
		assert.Equal(t, "Example Organization", capturedIdentity.Provisioning.OrganizationName)
	})

	t.Run("WhenValidJWTWithEmptyScopes_SetIdentityInContext", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		var capturedIdentity *principal.Principal

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			var ok bool
			capturedIdentity, ok = principal.FromContext(c.Context())
			require.True(t, ok)
			return c.SendStatus(fiber.StatusOK)
		})

		// Create valid JWT with empty scopes array
		claims := jwt.MapClaims{
			"sub":                    "user_splinter",
			"kaiten_external_org_id": "org_tmnt_hq",
			"scopes":                 []string{}, // Empty but present
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.NotNil(t, capturedIdentity)
		assert.Equal(t, "user_splinter", capturedIdentity.Provisioning.Subject)
		assert.Equal(t, "org_tmnt_hq", capturedIdentity.Provisioning.ExternalOrganizationID)
		assert.Empty(t, capturedIdentity.Scopes)
	})

	t.Run("WhenValidJWT_CallNextHandler", func(t *testing.T) {
		// Arrange
		app := createTestApp()
		middleware := &JWTMiddleware{}

		handlerCalled := false

		app.Use(middleware.Authorization())
		app.Get("/test", func(c fiber.Ctx) error {
			handlerCalled = true
			return c.JSON(fiber.Map{"message": "success"})
		})

		// Create valid JWT
		claims := jwt.MapClaims{
			"sub":                    "user_splinter",
			"kaiten_external_org_id": "org_tmnt_hq",
			"scopes":                 []string{"read:feature_flags"},
			"iat":                    time.Now().Unix(),
			"exp":                    time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		// Act
		resp, err := app.Test(req)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		assert.True(t, handlerCalled, "next handler should be called")

		body, _ := io.ReadAll(resp.Body)
		assert.Contains(t, string(body), "success")
	})
}
