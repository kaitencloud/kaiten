package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

type fakeKeys struct {
	keyID, organizationID uuid.UUID
	origins               []string
	known                 string
	calls                 int
}

func (f *fakeKeys) AuthenticatePublishableKey(_ context.Context, plain string) (uuid.UUID, uuid.UUID, []string, bool, error) {
	f.calls++
	if plain != f.known {
		return uuid.Nil, uuid.Nil, nil, false, nil
	}
	return f.keyID, f.organizationID, f.origins, true, nil
}

type fakeSessions struct {
	session               principal.CustomerSession
	organizationID, actor uuid.UUID
	known                 string
	calls                 int
}

func (f *fakeSessions) AuthenticateCustomerSession(_ context.Context, plain string) (principal.CustomerSession, uuid.UUID, uuid.UUID, bool, error) {
	f.calls++
	if plain != f.known {
		return principal.CustomerSession{}, uuid.Nil, uuid.Nil, false, nil
	}
	return f.session, f.organizationID, f.actor, true, nil
}

const (
	catalogPath = "/api/public/catalog"
	sessionPath = "/api/public/session/invoices"
)

func newPublicApp(t *testing.T, keys *fakeKeys, sessions *fakeSessions, now func() time.Time) *fiber.App {
	t.Helper()
	m := NewPublic(keys, sessions)
	if now != nil {
		m.now = now
	}
	app := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error { return fiberapi.Problem(c, err) }})
	app.Use(m.Authorization())
	app.Get(catalogPath, func(c fiber.Ctx) error {
		cl, err := caller.PublishableKey(c.Context())
		if err != nil {
			return err
		}
		return c.SendString(cl.OrganizationID().String() + "/" + cl.KeyID().String())
	})
	app.Get(sessionPath, func(c fiber.Ctx) error {
		cl, err := caller.CustomerSession(c.Context())
		if err != nil {
			return err
		}
		return c.SendString(cl.CustomerSlug() + "/" + cl.ActorID().String())
	})
	return app
}

func do(t *testing.T, app *fiber.App, path string, headers map[string]string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := app.Test(req)
	require.NoError(t, err)
	return resp
}

func fixtures() (*fakeKeys, *fakeSessions) {
	org := uuid.New()
	keys := &fakeKeys{keyID: uuid.New(), organizationID: org, origins: []string{"https://www.example.com"}, known: "pk_good"}
	instance := uuid.New()
	slug := "acme-prod"
	sessions := &fakeSessions{
		session: principal.CustomerSession{
			ID: uuid.New(), CustomerID: uuid.New(), CustomerSlug: "acme", InstanceID: &instance, InstanceSlug: &slug,
			AllowedOrigins: []string{"https://app.example.com"},
		},
		organizationID: org, actor: uuid.New(), known: "kst_good",
	}
	return keys, sessions
}

func TestPublicMiddlewarePublishableKey(t *testing.T) {
	keys, sessions := fixtures()
	app := newPublicApp(t, keys, sessions, nil)

	t.Run("a valid key from an allowed origin reads as its organization", func(t *testing.T) {
		resp := do(t, app, catalogPath, map[string]string{PublishableKeyHeader: "pk_good", "Origin": "https://WWW.example.com"})
		require.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("no Origin is a server-side read, and passes", func(t *testing.T) {
		resp := do(t, app, catalogPath, map[string]string{PublishableKeyHeader: "pk_good"})
		require.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("an origin the key does not allow is refused", func(t *testing.T) {
		resp := do(t, app, catalogPath, map[string]string{PublishableKeyHeader: "pk_good", "Origin": "https://evil.example"})
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("unknown, missing and wrong-family keys get one answer", func(t *testing.T) {
		for _, key := range []string{"pk_unknown", "", "ksh_abc", "sk_live_abc"} {
			resp := do(t, app, catalogPath, map[string]string{PublishableKeyHeader: key})
			require.Equal(t, http.StatusUnauthorized, resp.StatusCode, key)
		}
	})

	t.Run("an Authorization header is the wrong credential class, even beside a good key", func(t *testing.T) {
		before := keys.calls
		for _, header := range []string{"Bearer ksh_x", "Bearer kst_good"} {
			resp := do(t, app, catalogPath, map[string]string{PublishableKeyHeader: "pk_good", "Authorization": header})
			require.Equal(t, http.StatusForbidden, resp.StatusCode, header)
		}
		require.Equal(t, before, keys.calls, "refused before any lookup")
	})
}

func TestPublicMiddlewareCustomerSession(t *testing.T) {
	keys, sessions := fixtures()
	app := newPublicApp(t, keys, sessions, nil)

	t.Run("a valid session from an allowed origin reads as its customer, acted for by its minter", func(t *testing.T) {
		resp := do(t, app, sessionPath, map[string]string{"Authorization": "Bearer kst_good", "Origin": "https://app.example.com"})
		require.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("an origin no publishable key allows is refused", func(t *testing.T) {
		resp := do(t, app, sessionPath, map[string]string{"Authorization": "Bearer kst_good", "Origin": "https://evil.example"})
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("unknown, expired or missing sessions get one answer", func(t *testing.T) {
		for _, header := range []string{"Bearer kst_unknown", "", "Basic abc"} {
			resp := do(t, app, sessionPath, map[string]string{"Authorization": header})
			require.Equal(t, http.StatusUnauthorized, resp.StatusCode, header)
		}
	})

	t.Run("other credential classes are refused before any lookup", func(t *testing.T) {
		before := sessions.calls
		for _, headers := range []map[string]string{
			{"Authorization": "Bearer ksh_x"},
			{"Authorization": "Bearer eyJhbGciOi.jwt.x"},
			{PublishableKeyHeader: "pk_good"},
			{PublishableKeyHeader: "pk_good", "Authorization": "Bearer kst_good"},
		} {
			resp := do(t, app, sessionPath, headers)
			require.Equal(t, http.StatusForbidden, resp.StatusCode, headers)
		}
		require.Equal(t, before, sessions.calls)
	})
}

func TestPublicMiddlewareRateLimitsPerCredential(t *testing.T) {
	keys, sessions := fixtures()
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	app := newPublicApp(t, keys, sessions, func() time.Time { return now })

	for i := range publishableKeyBurst {
		resp := do(t, app, catalogPath, map[string]string{PublishableKeyHeader: "pk_good"})
		require.Equal(t, http.StatusOK, resp.StatusCode, "request %d is within the key's burst", i)
	}
	resp := do(t, app, catalogPath, map[string]string{PublishableKeyHeader: "pk_good"})
	require.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
	require.Equal(t, "1", resp.Header.Get("Retry-After"))

	// The session has its own bucket, and a smaller one.
	for i := range sessionBurst {
		resp := do(t, app, sessionPath, map[string]string{"Authorization": "Bearer kst_good"})
		require.Equal(t, http.StatusOK, resp.StatusCode, "request %d is within the session's burst", i)
	}
	resp = do(t, app, sessionPath, map[string]string{"Authorization": "Bearer kst_good"})
	require.Equal(t, http.StatusTooManyRequests, resp.StatusCode)

	now = now.Add(time.Second)
	resp = do(t, app, catalogPath, map[string]string{PublishableKeyHeader: "pk_good"})
	require.Equal(t, http.StatusOK, resp.StatusCode, "the bucket refills at the key's rate")
}
