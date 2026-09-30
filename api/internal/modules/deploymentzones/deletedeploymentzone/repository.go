package deletedeploymentzone

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

func (r *CommandRepository) DeleteDeploymentZone(ctx context.Context, organizationID uuid.UUID, slug string) (*schema.DeploymentZone, error) {
	params := db.DeleteDeploymentZoneBySlugParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	dz, err := r.q(ctx).DeleteDeploymentZoneBySlug(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteDeploymentZone.NotFound", fmt.Sprintf("Deployment zone with slug %q and organization %s not found", slug, organizationID))
		}
		return nil, err
	}

	var metadata map[string]any
	_ = json.Unmarshal(dz.Metadata, &metadata)

	return &schema.DeploymentZone{
		ID:          dz.ID,
		Name:        dz.Name,
		Type:        dz.Type,
		Metadata:    metadata,
		Description: dz.Description,
		CreatedBy:   shared.User{ID: dz.CreatedByID, Name: dz.CreatedByName},
		CreatedAt:   dz.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: dz.UpdatedByID, Name: dz.UpdatedByName},
		UpdatedAt:   dz.UpdatedAt.Time,
	}, nil
}
