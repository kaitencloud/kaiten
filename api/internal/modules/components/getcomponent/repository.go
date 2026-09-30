package getcomponent

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{repository: repository}
}

func (r *QueryRepository) GetComponentBySlug(ctx context.Context, slug string, organizationID uuid.UUID) (*componentschema.Component, error) {
	component, err := r.repository.GetComponentBySlug(ctx, db.GetComponentBySlugParams{
		Slug:           slug,
		OrganizationID: organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("Component.NotFound", fmt.Sprintf("Component with slug %q not found", slug))
		}
		return nil, err
	}

	return &componentschema.Component{
		ID:                  component.ID,
		PreviousComponentID: component.PreviousComponentID,
		Name:                component.Name,
		Version:             component.Version,
		Slug:                component.Slug,
		Description:         component.Description,
		CreatedBy:           shared.User{ID: component.CreatedByID, Name: component.CreatedByName},
		CreatedAt:           component.CreatedAt.Time,
	}, nil
}
