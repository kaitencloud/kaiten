package ensureorganization

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
)

type CommandRepository struct {
	repository *db.Queries
}

func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{repository: repository}
}

// EnsureOrganization derives the row's id from the external id and upserts it.
//
// Deriving rather than generating is what makes the operation idempotent without a
// read: the same external id always produces the same uuid, so a concurrent second
// caller collides on the primary key it was going to write anyway and takes the
// ON CONFLICT branch instead of creating a second tenant.
func (r *CommandRepository) EnsureOrganization(
	ctx context.Context, externalID, name string,
) (*organizationschema.Organization, error) {
	result, err := r.repository.EnsureOrganization(ctx, db.EnsureOrganizationParams{
		ID:         externalid.DeriveOrganizationID(externalID),
		ExternalID: externalID,
		Name:       name,
	})
	if err != nil {
		return nil, fmt.Errorf("ensure organization %q: %w", externalID, err)
	}

	return &organizationschema.Organization{
		ID:         result.ID,
		ExternalID: result.ExternalID,
		Name:       result.Name,
	}, nil
}
