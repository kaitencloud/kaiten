package jit

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

type stubProvisioner struct {
	called bool
}

func (s *stubProvisioner) Check(_ context.Context, identity *principal.Principal) error {
	s.called = true
	identity.UserID = uuid.New()
	identity.OrganizationID = uuid.New()
	return nil
}

func TestMiddleware(t *testing.T) {
	t.Run("does not resolve unauthenticated request", func(t *testing.T) {
		app := fiber.New()
		provisioner := &stubProvisioner{}
		app.Use(NewMiddleware(provisioner))
		app.Get("/", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

		response, err := app.Test(httptest.NewRequest("GET", "/", nil))

		require.NoError(t, err)
		require.Equal(t, fiber.StatusOK, response.StatusCode)
		require.False(t, provisioner.called)
	})

	t.Run("resolves principal carrying only external identity", func(t *testing.T) {
		app := fiber.New()
		provisioner := &stubProvisioner{}
		app.Use(func(c fiber.Ctx) error {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), &principal.Principal{
				Provisioning: principal.Provisioning{
					Subject:                "user_splinter",
					ExternalOrganizationID: "org_tmnt_hq",
				},
			}))
			return c.Next()
		})
		app.Use(NewMiddleware(provisioner))
		app.Get("/", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

		response, err := app.Test(httptest.NewRequest("GET", "/", nil))

		require.NoError(t, err)
		require.Equal(t, fiber.StatusOK, response.StatusCode)
		require.True(t, provisioner.called)
	})

	// A platform principal carries a UserID but deliberately no organization, so
	// without the explicit skip it would fall straight into Check -- which
	// requires an ExternalOrganizationID and *upserts* an organization. That
	// would silently give a platform credential the one thing it must never
	// have: an organization execution context.
	t.Run("skips platform principals, which have no organization to resolve", func(t *testing.T) {
		app := fiber.New()
		provisioner := &stubProvisioner{}
		identity := &principal.Principal{
			Kind:            principal.KindPlatform,
			UserID:          uuid.New(),
			PlatformTokenID: uuid.New(),
		}
		app.Use(func(c fiber.Ctx) error {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), identity))
			return c.Next()
		})
		app.Use(NewMiddleware(provisioner))
		app.Get("/", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

		response, err := app.Test(httptest.NewRequest("GET", "/", nil))

		require.NoError(t, err)
		require.Equal(t, fiber.StatusOK, response.StatusCode)
		require.False(t, provisioner.called)
		require.Equal(t, uuid.Nil, identity.OrganizationID,
			"no organization may be attached to a platform principal, by any path")
	})

	t.Run("skips resolution when principal already carries internal UUIDs", func(t *testing.T) {
		app := fiber.New()
		provisioner := &stubProvisioner{}
		app.Use(func(c fiber.Ctx) error {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), &principal.Principal{
				Kind:           principal.KindOrganization,
				UserID:         uuid.New(),
				OrganizationID: uuid.New(),
			}))
			return c.Next()
		})
		app.Use(NewMiddleware(provisioner))
		app.Get("/", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

		response, err := app.Test(httptest.NewRequest("GET", "/", nil))

		require.NoError(t, err)
		require.Equal(t, fiber.StatusOK, response.StatusCode)
		require.False(t, provisioner.called)
	})
}
