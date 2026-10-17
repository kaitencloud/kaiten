package validatetoken

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

func TestExtractToken(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		token, err := extractToken(c)
		if err != nil {
			return err
		}
		return c.SendString(token)
	})

	t.Run("WhenAuthorizationHeaderPresent_UseBearerToken", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer test-header-token")

		resp, err := app.Test(req)
		require.NoError(t, err)
		require.Equal(t, 200, resp.StatusCode)
	})
}

type stubUseCase struct {
	resp *ValidationResponse
	err  error
}

func (s *stubUseCase) ValidateToken(_ context.Context, _ string) (*ValidationResponse, error) {
	return s.resp, s.err
}

// TestRegisterEndpoint_AllowsEveryMethodWith200 pins both halves of the
// ext_authz contract this endpoint has to satisfy.
//
// The method loop: Envoy forwards the check request with the ORIGINAL
// request's verb, so a PAT-authenticated POST/PUT/PATCH/DELETE arrives here
// as that same verb. A GET-only route answered 405, which ext_authz
// (failure_mode_allow: false) turned into a denial of every write made with
// a `ksh_` token.
//
// The 200 assertion is load-bearing, not incidental: Envoy's ext_authz HTTP
// client allows a request through on an exact 200 only, so answering any
// other 2xx here denies every PAT-authenticated request and returns the
// check response to the caller instead of the real one.
func TestRegisterEndpoint_AllowsEveryMethodWith200(t *testing.T) {
	app := fiber.New()
	group := app.Group("/api")
	RegisterEndpoint(group, &stubUseCase{resp: &ValidationResponse{Valid: true, JWTToken: "signed.jwt.token"}})

	for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/api/tokens/validate", nil)
			req.Header.Set("Authorization", "Bearer ksh_test-token")

			resp, err := app.Test(req)
			require.NoError(t, err)
			require.Equal(t, 200, resp.StatusCode, "ext_authz allows only on an exact 200")
			require.Equal(t, "Bearer signed.jwt.token", resp.Header.Get("Authorization"))
		})
	}
}

// TestRegisterEndpoint_AnswersTheSameUnderAnySuffix is the ext_authz contract
// as the proxies actually call it: Envoy and Envoy Gateway only PREPEND the check
// path, so the check for a ksh_ request to /api/customers arrives at
// /api/tokens/validate/api/customers. Every such path must validate exactly as
// the canonical one does -- the same 200 and identity JWT, or the same 401 --
// and the suffix must change nothing.
func TestRegisterEndpoint_AnswersTheSameUnderAnySuffix(t *testing.T) {
	paths := []string{
		"/api/tokens/validate",
		"/api/tokens/validate/api/customers",
		"/api/tokens/validate/api/instances/acme/entitlements/seats/usage",
		"/api/tokens/validate/mcp/some/tool",
	}

	t.Run("a valid token mints the identity JWT on every path", func(t *testing.T) {
		app := fiber.New()
		RegisterEndpoint(app.Group("/api"), &stubUseCase{resp: &ValidationResponse{Valid: true, JWTToken: "signed.jwt.token"}})
		for _, path := range paths {
			for _, method := range []string{"GET", "POST", "DELETE"} {
				req := httptest.NewRequest(method, path, nil)
				req.Header.Set("Authorization", "Bearer ksh_test-token")
				resp, err := app.Test(req)
				require.NoError(t, err)
				require.Equal(t, 200, resp.StatusCode, "%s %s", method, path)
				require.Equal(t, "Bearer signed.jwt.token", resp.Header.Get("Authorization"), "%s %s", method, path)
			}
		}
	})

	t.Run("an invalid token is refused on every path", func(t *testing.T) {
		app := fiber.New(fiber.Config{ErrorHandler: fiberapi.SetErrorHandler()})
		RegisterEndpoint(app.Group("/api"), &stubUseCase{resp: &ValidationResponse{Valid: false, Error: "invalid token"}})
		for _, path := range paths {
			req := httptest.NewRequest("GET", path, nil)
			req.Header.Set("Authorization", "Bearer ksh_wrong")
			resp, err := app.Test(req)
			require.NoError(t, err)
			require.Equal(t, 401, resp.StatusCode, path)
			require.Empty(t, resp.Header.Get("Authorization"), "a refused token never mints an identity JWT (%s)", path)
		}
	})
}

// One error shape for the whole service: a bespoke `{"error": "..."}` body is
// one no generic client can parse.
func TestRegisterEndpoint_FailuresUseTheSharedProblemShape(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: fiberapi.SetErrorHandler()})
	group := app.Group("/api")
	RegisterEndpoint(group, &stubUseCase{resp: &ValidationResponse{Valid: false, Error: "token expired"}})

	tests := []struct {
		name       string
		authHeader string
		wantCode   string
		wantDetail string
	}{
		{"no header", "", "ValidateToken.MissingAuthorizationHeader", "missing valid Authorization header"},
		{"invalid token", "Bearer ksh_expired", "ValidateToken.Invalid", "token expired"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/tokens/validate", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			resp, err := app.Test(req)
			require.NoError(t, err)
			defer func() { _ = resp.Body.Close() }()

			require.Equal(t, 401, resp.StatusCode)
			require.Contains(t, resp.Header.Get("Content-Type"), "application/problem+json")

			raw, err := io.ReadAll(resp.Body)
			require.NoError(t, err)

			var problem apierrors.Problem
			require.NoError(t, json.Unmarshal(raw, &problem))
			require.Equal(t, tt.wantCode, problem.Code)
			require.Equal(t, tt.wantDetail, problem.Detail)
			require.Equal(t, 401, problem.Status)
			require.NotContains(t, string(raw), `"error"`, "the bespoke shape must be gone")
		})
	}
}
