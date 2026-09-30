package createrelease

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
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// release carries two UNIQUE constraints (see the initial migration):
// releaseSlugConstraint on (organization_id, slug), and a separate one on
// (version, organization_id). Only the former is a slug conflict --
// discriminating by constraint name keeps the latter from being mislabeled
// (and from being retried with a new slug, which would never fix a
// duplicate version).
const releaseSlugConstraint = "release_organization_id_slug_key"

// CommandRepository is bound to a *uow.UnitOfWork instead of a fixed
// *db.Queries/releaselink.Port pair: build it once (e.g. in NewUseCase) and
// call its methods directly, inside or outside a Transact closure. Each
// call resolves the DBTX active for ctx -- both this module's own
// generated Queries and the components module's public releaselink.Port
// are rebuilt from that same handle -- so every call here joins whatever
// transaction Transact opened for that ctx, with no db.New(...) or
// releaselink.New(...) at the call site.
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

func (r *CommandRepository) CreateRelease(ctx context.Context, version string, slug string, description *string, organizationID uuid.UUID, userID uuid.UUID) (*schema.Release, error) {
	release := db.CreateReleaseParams{
		Version:        version,
		Slug:           slug,
		Description:    description,
		OrganizationID: organizationID,
		UserID:         userID,
	}

	rl, err := r.q(ctx).CreateRelease(ctx, release)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.Forbidden(
				"CurrentUser.NotInOrganization",
				fmt.Sprintf("User %s does not belong to organization %s", userID, organizationID),
			)
		}
		if kaitenerrors.IsUniqueViolationOnConstraint(err, releaseSlugConstraint) {
			return nil, kaitenerrors.Wrap(
				slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateRelease.SlugConflict",
				fmt.Sprintf("Release with slug %q already exists in this organization", slug),
			)
		}
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict(
				"CreateRelease.VersionConflict",
				fmt.Sprintf("Release with version %q already exists in this organization", version),
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

func (r *CommandRepository) GetComponentByID(ctx context.Context, componentID uuid.UUID, organizationID uuid.UUID) (*componentschema.Component, error) {
	return r.components(ctx).GetComponentByID(ctx, componentID, organizationID)
}

func (r *CommandRepository) AddComponentToRelease(ctx context.Context, componentID uuid.UUID, releaseID uuid.UUID, organizationID uuid.UUID) error {
	return r.components(ctx).AddComponentToRelease(ctx, componentID, releaseID, organizationID)
}

func (r *CommandRepository) GetComponentsByReleaseID(ctx context.Context, releaseID uuid.UUID, organizationID uuid.UUID) ([]componentschema.Component, error) {
	return r.components(ctx).GetComponentsByReleaseID(ctx, releaseID, organizationID)
}
