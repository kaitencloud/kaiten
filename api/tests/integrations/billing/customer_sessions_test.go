package billing_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const storefront = "https://app.acme.test"

// mintSession mints a customer session, bound to instanceSlug when it is not
// empty.
func mintSession(t *testing.T, server *tests.TestServer, customerSlug, instanceSlug string) createcustomersession.CreatedCustomerSession {
	t.Helper()
	body := map[string]any{"customerSlug": customerSlug}
	if instanceSlug != "" {
		body["instanceSlug"] = instanceSlug
	}
	return commonfixture.AssertJSONResponse[createcustomersession.CreatedCustomerSession](t,
		callOn(t, server, "POST", "/api/customer-sessions", body), fiber.StatusCreated)
}

// sessionCall calls a /api/public/session route the way the customer's
// browser does: the session as a bearer token, from origin when it is set.
func sessionCall(t *testing.T, server *tests.TestServer, method, path, token, origin string, payload any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, payload)
	req.Header.Del("Authorization")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	resp, err := server.App.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func sessionProblem(t *testing.T, resp *http.Response, status int) string {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, status).Code
}

func TestCustomerSessions(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	version := newVersion(t, "Pro", "PUBLISHED")
	acme := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", acme.ID, version.ID)
	other := newCustomer(t, "globex")
	otherInstance := newInstance(t, "Globex prod", other.ID, version.ID)
	newPublishableKey(t, storefront)
	const invoicesPath = "/api/public/session/invoices"

	t.Run("a session is minted for a customer and one of its instances", func(t *testing.T) {
		created := mintSession(t, testServer, acme.Slug, instance.Slug)
		require.Regexp(t, `^kst_[A-Za-z0-9_-]{43}$`, created.Token)
		require.Equal(t, instance.Slug, *created.InstanceSlug)
		require.WithinDuration(t, time.Now().Add(30*time.Minute), created.ExpiresAt, time.Minute, "30 minutes by default")

		page := commonfixture.AssertJSONResponse[pagination.Page[sessions.SessionInvoice]](t,
			sessionCall(t, testServer, "GET", invoicesPath, created.Token, storefront, nil), fiber.StatusOK)
		require.Empty(t, page.Items)
	})

	t.Run("minting is refused for what the organization does not hold", func(t *testing.T) {
		require.Equal(t, "CreateCustomerSession.InvalidTtl", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/customer-sessions",
			map[string]any{"customerSlug": acme.Slug, "ttlSeconds": 60}))
		require.Equal(t, "CreateCustomerSession.CustomerNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/customer-sessions",
			map[string]any{"customerSlug": "nope"}))
		require.Equal(t, "CreateCustomerSession.InstanceNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/customer-sessions",
			map[string]any{"customerSlug": acme.Slug, "instanceSlug": "nope"}))
		require.Equal(t, "CreateCustomerSession.InstanceNotOfCustomer", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/customer-sessions",
			map[string]any{"customerSlug": acme.Slug, "instanceSlug": otherInstance.Slug}))
	})

	t.Run("a browser may use a session only from an origin the publishable keys allow", func(t *testing.T) {
		created := mintSession(t, testServer, acme.Slug, "")
		require.Equal(t, fiber.StatusOK, sessionCall(t, testServer, "GET", invoicesPath, created.Token, "", nil).StatusCode,
			"a server-side call sends no Origin")
		require.Equal(t, "PublicAuth.OriginNotAllowed",
			sessionProblem(t, sessionCall(t, testServer, "GET", invoicesPath, created.Token, "https://evil.example", nil), fiber.StatusForbidden))
	})

	t.Run("the credential classes of the public surface do not mix", func(t *testing.T) {
		created := mintSession(t, testServer, acme.Slug, "")
		key := newPublishableKey(t, storefront)

		// A session on the catalogue.
		req := httptest.NewRequest(http.MethodGet, "/api/public/catalog", nil)
		req.Header.Set("Authorization", "Bearer "+created.Token)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		require.Equal(t, principalWrongKind, sessionProblem(t, resp, fiber.StatusForbidden))

		// A publishable key on a session route.
		req = httptest.NewRequest(http.MethodGet, invoicesPath, nil)
		req.Header.Set("X-Kaiten-Publishable-Key", key.Key)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		require.Equal(t, principalWrongKind, sessionProblem(t, resp, fiber.StatusForbidden))

		// An organization credential on a session route.
		require.Equal(t, principalWrongKind,
			sessionProblem(t, sessionCall(t, testServer, "GET", invoicesPath, "ksh_whatever", "", nil), fiber.StatusForbidden))
	})

	t.Run("an expired session no longer authenticates", func(t *testing.T) {
		created := mintSession(t, testServer, acme.Slug, "")
		_, err := testServer.Dependencies.DB.Exec(t.Context(),
			`UPDATE customer_session SET created_at = now() - interval '2 hours', expires_at = now() - interval '90 minutes' WHERE id = $1`, created.ID)
		require.NoError(t, err)
		require.Equal(t, "PublicAuth.InvalidCredential",
			sessionProblem(t, sessionCall(t, testServer, "GET", invoicesPath, created.Token, "", nil), fiber.StatusUnauthorized))
	})

	t.Run("a revoked session stops authenticating at once", func(t *testing.T) {
		created := mintSession(t, testServer, acme.Slug, "")
		path := "/api/customer-sessions/" + created.ID.String() + "/revoke"
		require.Equal(t, fiber.StatusNoContent, call(t, "POST", path, nil).StatusCode)
		require.Equal(t, fiber.StatusNoContent, call(t, "POST", path, nil).StatusCode, "idempotent")
		require.Equal(t, "PublicAuth.InvalidCredential",
			sessionProblem(t, sessionCall(t, testServer, "GET", invoicesPath, created.Token, "", nil), fiber.StatusUnauthorized))
		require.Equal(t, "RevokeCustomerSession.NotFound", problemCode(t, fiber.StatusNotFound, "POST",
			"/api/customer-sessions/"+uuid.NewString()+"/revoke", nil))
	})

	t.Run("an unknown session and a missing one get one answer", func(t *testing.T) {
		for _, token := range []string{"kst_" + strings.Repeat("x", 43), ""} {
			require.Equal(t, "PublicAuth.InvalidCredential",
				sessionProblem(t, sessionCall(t, testServer, "GET", invoicesPath, token, "", nil), fiber.StatusUnauthorized))
		}
	})
}

const principalWrongKind = "Auth.WrongCredentialKind"
