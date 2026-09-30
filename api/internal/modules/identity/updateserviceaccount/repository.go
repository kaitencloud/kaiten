package updateserviceaccount

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	repository *db.Queries
}

func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{
		repository: repository,
	}
}

func (r *CommandRepository) UpdateServiceAccount(ctx context.Context, saSlug string, name string, organizationID uuid.UUID) error {
	args := db.UpdateServiceAccountNameParams{
		Slug:           &saSlug,
		Name:           name,
		OrganizationID: &organizationID,
	}

	result, err := r.repository.UpdateServiceAccountName(ctx, args)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return kaitenerrors.NotFound("ServiceAccount.NotFound", fmt.Sprintf("ServiceAccount with slug %s not found in organization %s", saSlug, organizationID))
	}

	return nil
}
