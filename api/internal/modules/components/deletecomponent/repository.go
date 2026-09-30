package deletecomponent

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) GetComponentBySlug(ctx context.Context, slug string, organizationID uuid.UUID) (*componentschema.Component, error) {
	component, err := r.q(ctx).GetComponentBySlug(ctx, db.GetComponentBySlugParams{
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

func (r *CommandRepository) CountReleaseLinksByComponentID(ctx context.Context, componentID uuid.UUID, organizationID uuid.UUID) (int64, error) {
	return r.q(ctx).CountReleaseLinksByComponentID(ctx, db.CountReleaseLinksByComponentIDParams{
		ComponentID:    componentID,
		OrganizationID: organizationID,
	})
}

func (r *CommandRepository) DeleteComponentBySlug(ctx context.Context, slug string, organizationID uuid.UUID) (*componentschema.Component, error) {
	component, err := r.q(ctx).DeleteComponentBySlug(ctx, db.DeleteComponentBySlugParams{
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
