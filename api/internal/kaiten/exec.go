package kaiten

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// bindOrganization installs the principal an organization use case reads through
// principal.FromContext -- and, through it, the identity currentuser.Provider
// answers with.
func bindOrganization(ctx context.Context, cl caller.OrganizationCaller) context.Context {
	return principal.ContextWithPrincipal(ctx, &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         cl.UserID(),
		OrganizationID: cl.OrganizationID(),
		Scopes:         cl.Scopes(),
	})
}

// bindPlatform installs the principal a platform use case reads through
// principal.FromContext.
func bindPlatform(ctx context.Context, cl caller.PlatformCaller) context.Context {
	return principal.ContextWithPrincipal(ctx, &principal.Principal{
		Kind:            principal.KindPlatform,
		PlatformTokenID: cl.PlatformTokenID(),
		Scopes:          cl.Scopes(),
	})
}

// bindSystem installs the principal for work Kaiten does on its own behalf inside
// one organization.
func bindSystem(ctx context.Context, userID, organizationID uuid.UUID) (context.Context, error) {
	if userID == uuid.Nil || organizationID == uuid.Nil {
		return nil, ErrIncompleteSystemPrincipal
	}

	return principal.ContextWithPrincipal(ctx, &principal.Principal{
		Kind:           principal.KindSystem,
		UserID:         userID,
		OrganizationID: organizationID,
	}), nil
}

// ErrIncompleteSystemPrincipal is returned by bindSystem when it is asked to build a
// principal that names no actor or no organization. It is a programming error, not a
// refusal a client could ever see, which is why it is a plain error rather than an
// apierrors kind.
var ErrIncompleteSystemPrincipal = errors.New(
	"kaiten: a system principal needs both an actor and an organization",
)

// bindInProcess installs a principal that authenticates nothing.
func bindInProcess(ctx context.Context) context.Context {
	return principal.ContextWithPrincipal(ctx, &principal.Principal{
		Kind: principal.KindUnset,
	})
}
