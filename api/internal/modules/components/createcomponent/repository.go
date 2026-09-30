package createcomponent

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
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	componentNameVersionUniqueConstraint = "component_name_version_unique"
	componentSlugUniqueConstraint        = "component_organization_id_slug_key"
)

// CommandRepository is bound to a *uow.UnitOfWork instead of a fixed
// *db.Queries: build it once (e.g. in NewUseCase) and call its methods
// directly, inside or outside a Transact closure. Each call resolves the
// DBTX active for ctx, so it joins whatever transaction Transact opened for
// that ctx, with no db.New(...) at the call site.
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
			return kaitenerrors.Wrap(
				slugutil.ErrConflict, kaitenerrors.KindConflict,
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
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.Forbidden(
				"CurrentUser.NotInOrganization",
				fmt.Sprintf("User %s does not belong to organization %s", userID, organizationID),
			)
		}
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

func (r *CommandRepository) GetComponentByID(ctx context.Context, componentID uuid.UUID, organizationID uuid.UUID) (*componentschema.Component, error) {
	component, err := r.q(ctx).GetComponentByID(ctx, db.GetComponentByIDParams{
		ComponentID:    componentID,
		OrganizationID: organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("Component.NotFound", fmt.Sprintf("Component with ID %s not found", componentID))
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
