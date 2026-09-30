package deleterelease

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// CommandRepository is bound to a *uow.UnitOfWork instead of a fixed
// *db.Queries/releaselink.Port pair -- see createrelease.CommandRepository's
// doc comment for the pattern.
type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves this module's own sqlc Queries bound to whatever DBTX is
// active for ctx.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// components resolves the components module's public releaselink.Port
// bound to whatever DBTX is active for ctx.
func (r *CommandRepository) components(ctx context.Context) releaselink.Port {
	return releaselink.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) GetReleaseBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*schema.Release, error) {
	params := db.GetOneReleaseBySlugParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	rl, err := r.q(ctx).GetOneReleaseBySlug(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteRelease.NotFound", fmt.Sprintf("Release with slug %q not found", slug))
		}
		return nil, err
	}

	return &schema.Release{
		ID:          rl.ID,
		Version:     rl.Version,
		Slug:        rl.Slug,
		Description: rl.Description,
		CreatedBy:   shared.User{ID: rl.CreatedByID, Name: rl.CreatedByName},
		CreatedAt:   rl.CreatedAt.Time,
	}, nil
}

func (r *CommandRepository) GetComponentsByReleaseID(ctx context.Context, releaseID uuid.UUID, organizationID uuid.UUID) ([]componentschema.Component, error) {
	return r.components(ctx).GetComponentsByReleaseID(ctx, releaseID, organizationID)
}

func (r *CommandRepository) RemoveAllComponentsFromRelease(ctx context.Context, releaseID uuid.UUID, organizationID uuid.UUID) error {
	return r.components(ctx).RemoveAllComponentsFromRelease(ctx, releaseID, organizationID)
}

func (r *CommandRepository) DeleteRelease(ctx context.Context, organizationID uuid.UUID, slug string) (*schema.Release, error) {
	params := db.DeleteReleaseBySlugParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	rl, err := r.q(ctx).DeleteReleaseBySlug(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteRelease.NotFound", fmt.Sprintf("Release with slug %q and organization %s not found", slug, organizationID))
		}
		// deployment and a successor release's previous_release_id both
		// reference release with ON DELETE RESTRICT, so a deployed or
		// superseded release fails here.
		if kaitenerrors.IsForeignKeyViolation(err) {
			return nil, kaitenerrors.Conflict(
				"DeleteRelease.InUseConflict",
				fmt.Sprintf("Release with slug %q is still deployed or referenced by another release and cannot be deleted", slug),
			)
		}
		return nil, err
	}

	return &schema.Release{
		ID:          rl.ID,
		Version:     rl.Version,
		Slug:        rl.Slug,
		Description: rl.Description,
		CreatedBy:   shared.User{ID: rl.CreatedByID, Name: rl.CreatedByName},
		CreatedAt:   rl.CreatedAt.Time,
	}, nil
}
