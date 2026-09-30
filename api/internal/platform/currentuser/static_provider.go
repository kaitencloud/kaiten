package currentuser

import (
	"context"

	"github.com/google/uuid"
)

// StaticUserProvider is a Provider implementation for non-HTTP contexts
// like seeders, CLI tools, or background workers where the user identity
// is known at initialization time rather than extracted from a request.
type StaticUserProvider struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
}

func (p *StaticUserProvider) GetUser(_ context.Context) (*User, error) {
	return &User{
		ID:             p.UserID,
		OrganizationID: p.OrganizationID,
	}, nil
}
