package jit

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

type provisioner interface {
	Check(ctx context.Context, identity *principal.Principal) error
}

// NewMiddleware resolves only identities already authenticated by the
// preceding auth middleware into internal UUIDs. Requests without a
// principal in context (public paths) pass through untouched. Principals
// that already carry internal UUIDs (e.g. test/StubMiddleware) skip
// resolution entirely.
func NewMiddleware(p provisioner) fiber.Handler {
	return func(c fiber.Ctx) error {
		identity, ok := principal.FromContext(c.Context())
		if !ok {
			return c.Next()
		}

		// A platform credential deliberately has no organization to resolve.
		// Running JIT for it would be actively wrong, not merely wasteful:
		// Provisioner.Check requires a non-empty ExternalOrganizationID, and
		// resolveOrganization *upserts* an organization -- which is exactly the
		// implicit organization attachment a platform credential must never get.
		if identity.IsPlatform() {
			return c.Next()
		}

		// A publishable key and a customer session name their organization by
		// id -- and a session its actor -- so there is nothing to provision: the
		// authenticator that built them has already resolved everything.
		if identity.Kind == principal.KindPublishableKey || identity.Kind == principal.KindCustomerSession {
			return c.Next()
		}

		if identity.UserID != uuid.Nil && identity.OrganizationID != uuid.Nil {
			return c.Next()
		}

		if err := p.Check(c.Context(), identity); err != nil {
			return err
		}
		return c.Next()
	}
}
