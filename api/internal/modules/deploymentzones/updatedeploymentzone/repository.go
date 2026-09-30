package updatedeploymentzone

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

// GetDeploymentZoneBySlug reads the current DZ row. Exposed on the repository
// (rather than called via h.svc.Queries) so the handler can read it through
// the transactional repo — keeping the pre-update metadata snapshot atomic
// with the UpdateDeploymentZone write.
func (r *CommandRepository) GetDeploymentZoneBySlug(ctx context.Context, slug string, organizationID uuid.UUID) (db.GetOneDeploymentZoneBySlugRow, error) {
	return r.q(ctx).GetOneDeploymentZoneBySlug(ctx, db.GetOneDeploymentZoneBySlugParams{
		OrganizationID: organizationID,
		Slug:           slug,
	})
}

func (r *CommandRepository) UpdateDeploymentZone(ctx context.Context, command *Command, slug string, userID uuid.UUID, organizationID uuid.UUID) (*schema.DeploymentZone, error) {
	metadataMarshalled, err := json.Marshal(command.Metadata)
	if err != nil {
		return nil, err
	}

	sqlcParams := db.UpdateDeploymentZoneBySlugParams{
		Slug:           slug,
		Name:           command.Name,
		Type:           command.Type,
		Metadata:       metadataMarshalled,
		Description:    command.Description,
		OrganizationID: organizationID,
		UserID:         userID,
	}

	dz, err := r.q(ctx).UpdateDeploymentZoneBySlug(ctx, sqlcParams)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteDeploymentZone.NotFound", fmt.Sprintf("Deployment zone with slug %q and organization %s not found", slug, organizationID))
		}
		return nil, err
	}

	var metadata map[string]interface{}
	_ = json.Unmarshal(dz.Metadata, &metadata)

	return &schema.DeploymentZone{
		ID:          dz.ID,
		Name:        dz.Name,
		Slug:        dz.Slug,
		Type:        dz.Type,
		Metadata:    metadata,
		Description: dz.Description,
		CreatedBy:   shared.User{ID: dz.CreatedByID, Name: dz.CreatedByName},
		CreatedAt:   dz.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: dz.UpdatedByID, Name: dz.UpdatedByName},
		UpdatedAt:   dz.UpdatedAt.Time,
	}, nil
}
