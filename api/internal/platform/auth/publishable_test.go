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

func newPublicApp(t *testing.T, keys *fakeKeys, now func() time.Time) *fiber.App {
	t.Helper()
	m := NewPublishableKey(keys)
	if now != nil {
		m.now = now
	}
	app := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error { return fiberapi.Problem(c, err) }})
	app.Use(m.Authorization())
	app.Get("/api/public/catalog", func(c fiber.Ctx) error {
		cl, err := caller.PublishableKey(c.Context())
		if err != nil {
			return err
		}
		return c.SendString(cl.OrganizationID().String() + "/" + cl.KeyID().String())
	})
	return app
}

func do(t *testing.T, app *fiber.App, headers map[string]string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/public/catalog", nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := app.Test(req)
	require.NoError(t, err)
	return resp
}

func TestPublishableKeyMiddleware(t *testing.T) {
	keys := &fakeKeys{
		keyID: uuid.New(), organizationID: uuid.New(),
		origins: []string{"https://www.example.com"}, known: "pk_good",
	}
	app := newPublicApp(t, keys, nil)

	t.Run("a valid key from an allowed origin reads as its organization", func(t *testing.T) {
		resp := do(t, app, map[string]string{PublishableKeyHeader: "pk_good", "Origin": "https://WWW.example.com"})
		require.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("no Origin is a server-side read, and passes", func(t *testing.T) {
		resp := do(t, app, map[string]string{PublishableKeyHeader: "pk_good"})
		require.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("an origin the key does not allow is refused", func(t *testing.T) {
		resp := do(t, app, map[string]string{PublishableKeyHeader: "pk_good", "Origin": "https://evil.example"})
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("unknown, missing and wrong-family keys get one answer", func(t *testing.T) {
		for _, key := range []string{"pk_unknown", "", "ksh_abc", "sk_live_abc"} {
			resp := do(t, app, map[string]string{PublishableKeyHeader: key})
			require.Equal(t, http.StatusUnauthorized, resp.StatusCode, key)
		}
	})

	t.Run("an Authorization header is the wrong credential class, even beside a good key", func(t *testing.T) {
		before := keys.calls
		resp := do(t, app, map[string]string{PublishableKeyHeader: "pk_good", "Authorization": "Bearer ksh_x"})
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		require.Equal(t, before, keys.calls, "refused before any lookup")
	})
}

func TestPublishableKeyMiddlewareRateLimitsPerKey(t *testing.T) {
	keys := &fakeKeys{keyID: uuid.New(), organizationID: uuid.New(), known: "pk_good"}
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	app := newPublicApp(t, keys, func() time.Time { return now })

	for i := range publishableKeyBurst {
		resp := do(t, app, map[string]string{PublishableKeyHeader: "pk_good"})
		require.Equal(t, http.StatusOK, resp.StatusCode, "request %d is within the burst", i)
	}
	resp := do(t, app, map[string]string{PublishableKeyHeader: "pk_good"})
	require.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
	require.Equal(t, "1", resp.Header.Get("Retry-After"))

	now = now.Add(time.Second)
	resp = do(t, app, map[string]string{PublishableKeyHeader: "pk_good"})
	require.Equal(t, http.StatusOK, resp.StatusCode, "the bucket refills at the key's rate")
}
