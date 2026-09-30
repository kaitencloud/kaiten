package currentuser

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type User struct {
	ID             uuid.UUID
	OrganizationID uuid.UUID
}

type Provider interface {
	GetUser(ctx context.Context) (*User, error)
}

type ContextUserProvider struct{}

func (c *ContextUserProvider) GetUser(ctx context.Context) (*User, error) {
	i, ok := principal.FromContext(ctx)

	if !ok {
		return nil, kaitenerrors.Unauthorized("CurrentUser.NoIdentityInContext", "No identity found in context")
	}

	// Fail closed for every credential class that is not an organization one. A
	// User is an actor *inside* an organization -- its OrganizationID is
	// dereferenced by ~570 call sites, none of which check for uuid.Nil -- so the
	// honest answer for a principal that establishes no organization is a refusal,
	// not a User whose organization is the zero UUID. This one choke point is what
	// makes those call sites safe without 88 defensive checks.
	switch {
	case i.IsPlatform():
		return nil, kaitenerrors.Forbidden("CurrentUser.PlatformPrincipalHasNoOrganization",
			"platform credential has no organization execution context")
	case i.Kind == principal.KindSystem:
		if i.UserID == uuid.Nil || i.OrganizationID == uuid.Nil {
			return nil, kaitenerrors.Forbidden("CurrentUser.SystemPrincipalIsIncomplete",
				"system principal names no actor or no organization execution context")
		}
	case i.Kind != principal.KindOrganization:
		return nil, kaitenerrors.Forbidden("CurrentUser.NoOrganizationContext",
			"credential establishes no organization execution context")
	}

	return &User{
		ID:             i.UserID,
		OrganizationID: i.OrganizationID,
	}, nil
}
