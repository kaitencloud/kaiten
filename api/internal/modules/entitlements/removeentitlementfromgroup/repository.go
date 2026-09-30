package removeentitlementfromgroup

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
)

// Repository defines the interface for removing an entitlement from a group.
// CommandRepository implements Repository using sqlc queries.
type CommandRepository struct {
	repository *db.Queries
}

// NewCommandRepository creates a new CommandRepository.
func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{
		repository: repository,
	}
}

// RemoveEntitlementFromGroup removes an entitlement from a group.
func (r *CommandRepository) RemoveEntitlementFromGroup(ctx context.Context, groupSlug string, entitlementSlug string, organizationID uuid.UUID) error {
	params := db.RemoveEntitlementFromGroupParams{
		GroupSlug:       groupSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	}

	return r.repository.RemoveEntitlementFromGroup(ctx, params)
}
