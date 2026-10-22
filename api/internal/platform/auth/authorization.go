package auth

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

type UserAuthorizationResolver interface {
	Resolve(context.Context, uuid.UUID, uuid.UUID) ([]string, error)
}
type TokenAuthorizationResolver interface {
	Resolve(context.Context, uuid.UUID, string, string) (uuid.UUID, uuid.UUID, []string, error)
}

// ResolveAuthorization runs after JIT, including identity-cache hits. It never
// caches grants or trusts provider claims. Injected/local principals with no
// provisioning identity remain the responsibility of their trusted driver.
func ResolveAuthorization(users UserAuthorizationResolver, tokens TokenAuthorizationResolver) fiber.Handler {
	return func(c fiber.Ctx) error {
		p, ok := principal.FromContext(c.Context())
		if !ok || p.Kind != principal.KindOrganization || p.Provisioning.Subject == "" {
			return c.Next()
		}
		p.Scopes = nil
		if p.OrganizationTokenID != uuid.Nil {
			userID, orgID, grants, err := tokens.Resolve(c.Context(), p.OrganizationTokenID, p.Provisioning.Subject, p.Provisioning.ExternalOrganizationID)
			if err != nil {
				return err
			}
			p.UserID, p.OrganizationID, p.Scopes = userID, orgID, grants
		} else {
			grants, err := users.Resolve(c.Context(), p.OrganizationID, p.UserID)
			if err != nil {
				return err
			}
			p.Scopes = grants
		}
		return c.Next()
	}
}
