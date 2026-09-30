package updatecomponent

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	componentNameVersionUniqueConstraint = "component_name_version_unique"
	componentSlugUniqueConstraint        = "component_organization_id_slug_key"
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

func mapComponentWriteError(err error, name string, version string, slug string) error {
	if !kaitenerrors.IsUniqueViolation(err) {
		return err
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.ConstraintName {
		case componentSlugUniqueConstraint:
			return kaitenerrors.Conflict(
				"Component.SlugConflict",
				fmt.Sprintf("Component with slug %q already exists in this organization", slug),
			)
		case componentNameVersionUniqueConstraint:
			return kaitenerrors.Conflict(
				"Component.NameVersionConflict",
				fmt.Sprintf("Component with name %q and version %q already exists in this organization", name, version),
			)
		}
	}

	return kaitenerrors.Conflict(
		"Component.UniqueConflict",
		fmt.Sprintf("Component with name %q, version %q, or slug %q already exists in this organization", name, version, slug),
	)
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

func (r *CommandRepository) CreateComponent(ctx context.Context, name string, version string, slug string, description *string, previousComponentID *uuid.UUID, organizationID uuid.UUID, userID uuid.UUID) (*componentschema.Component, error) {
	component, err := r.q(ctx).CreateComponent(ctx, db.CreateComponentParams{
		Name:                name,
		Version:             version,
		Slug:                slug,
		Description:         description,
		PreviousComponentID: previousComponentID,
		OrganizationID:      organizationID,
		UserID:              userID,
	})
	if err != nil {
		return nil, mapComponentWriteError(err, name, version, slug)
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

func (r *CommandRepository) UpdateComponent(ctx context.Context, componentID uuid.UUID, name string, version string, slug string, description *string, organizationID uuid.UUID) (*componentschema.Component, error) {
	component, err := r.q(ctx).UpdateComponent(ctx, db.UpdateComponentParams{
		ComponentID:    componentID,
		NewName:        &name,
		NewVersion:     &version,
		NewSlug:        &slug,
		NewDescription: description,
		OrganizationID: organizationID,
	})
	if err != nil {
		return nil, mapComponentWriteError(err, name, version, slug)
	}

	return &componentschema.Component{
		ID:                  component.ID,
		PreviousComponentID: component.PreviousComponentID,
		Name:                component.Name,
		Version:             component.Version,
		Slug:                component.Slug,
		Description:         component.Description,
		CreatedBy:           shared.User{ID: component.CreatedByID},
		CreatedAt:           component.CreatedAt.Time,
	}, nil
}
