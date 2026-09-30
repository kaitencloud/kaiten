package createdeploymentzone

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
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

func (r *CommandRepository) CreateDeploymentZone(ctx context.Context, name string, slug string, zoneType string, metadata map[string]interface{}, description string, releaseID *uuid.UUID, organizationID uuid.UUID, userID uuid.UUID) (*schema.DeploymentZone, error) {
	metadataMarshalled, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}

	deploymentZone := db.CreateDeploymentZoneParams{
		Name:           name,
		Slug:           slug,
		Type:           zoneType,
		Metadata:       metadataMarshalled,
		Description:    description,
		OrganizationID: organizationID,
		UserID:         userID,
	}

	dz, err := r.q(ctx).CreateDeploymentZone(ctx, deploymentZone)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.Forbidden(
				"CurrentUser.NotInOrganization",
				fmt.Sprintf("User %s does not belong to organization %s", userID, organizationID),
			)
		}
		if kaitenerrors.IsUniqueViolation(err) {
			// deployment_zone's only UNIQUE constraint besides the primary
			// key is (organization_id, slug), so any unique violation here
			// is a slug conflict. Wrapping slugutil.ErrConflict lets
			// slugutil.Retry recognize this as retryable when the slug was
			// auto-generated.
			return nil, kaitenerrors.Wrap(
				slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateDeploymentZone.SlugConflict",
				fmt.Sprintf("Deployment zone with slug %q already exists in this organization", slug),
			)
		}
		return nil, err
	}

	return &schema.DeploymentZone{
		ID:          dz.ID,
		Name:        dz.Name,
		Slug:        dz.Slug,
		Type:        dz.Type,
		Metadata:    metadata,
		Description: dz.Description,
		ReleaseID:   releaseID,
		CreatedBy:   shared.User{ID: dz.CreatedByID, Name: dz.CreatedByName},
		CreatedAt:   dz.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: dz.UpdatedByID, Name: dz.UpdatedByName},
		UpdatedAt:   dz.UpdatedAt.Time,
	}, nil
}
