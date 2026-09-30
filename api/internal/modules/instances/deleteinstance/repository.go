package deleteinstance

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
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

func (r *CommandRepository) DeleteInstance(ctx context.Context, userID uuid.UUID, organizationID uuid.UUID, slug string) (*schema.Instance, error) {
	params := db.DeleteInstanceParams{
		Slug:           slug,
		UserID:         userID,
		OrganizationID: organizationID,
	}

	i, err := r.q(ctx).DeleteInstance(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	licenseSlug := ""
	if i.LicenseSlug != nil {
		licenseSlug = *i.LicenseSlug
	}

	return &schema.Instance{
		ID:                 i.ID,
		Name:               i.Name,
		Slug:               i.Slug,
		Description:        i.Description,
		CreatedBy:          shared.User{ID: i.CreatedByID, Name: i.CreatedByName},
		CreatedAt:          i.CreatedAt.Time,
		UpdatedBy:          shared.User{ID: i.UpdatedByID, Name: i.UpdatedByName},
		UpdatedAt:          i.UpdatedAt.Time,
		Status:             schema.InstanceStatus(i.Status),
		LifecycleStage:     i.LifecycleStage,
		CustomerID:         i.CustomerID,
		LicenseID:          i.LicenseID,
		LicenseSlug:        licenseSlug,
		DeploymentZoneID:   i.DeploymentZoneID,
		DeploymentZoneSlug: i.DeploymentZoneSlug,
		StartLicenseDate:   i.StartLicenseDate.Time,
		EndLicenseDate:     i.EndLicenseDate.Time,
	}, nil
}
