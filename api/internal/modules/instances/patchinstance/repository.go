package patchinstance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

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

func (r *CommandRepository) GetInstance(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.Instance, error) {
	i, err := r.q(ctx).GetOneInstance(ctx, db.GetOneInstanceParams{
		Slug:           slug,
		OrganizationID: organizationID,
	})
	if err != nil {
		if isNoRows(err) {
			return nil, kaitenerrors.NotFound("PatchInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	return getOneInstanceRowToSchema(i)
}

func (r *CommandRepository) UpdateInstanceStatus(ctx context.Context, status schema.InstanceStatus, slug string, userID uuid.UUID, organizationID uuid.UUID) (*schema.Instance, error) {
	i, err := r.q(ctx).UpdateInstanceStatus(ctx, db.UpdateInstanceStatusParams{
		Status:         db.InstanceStatus(status),
		OrganizationID: organizationID,
		UserID:         userID,
		Slug:           slug,
	})
	if err != nil {
		if isNoRows(err) {
			return nil, kaitenerrors.NotFound("PatchInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	return updateInstanceStatusRowToSchema(i)
}

func (r *CommandRepository) UpdateInstanceLifecycleStage(ctx context.Context, lifecycleStage *string, slug string, userID uuid.UUID, organizationID uuid.UUID) (*schema.Instance, error) {
	i, err := r.q(ctx).UpdateInstanceLifecycleStage(ctx, db.UpdateInstanceLifecycleStageParams{
		LifecycleStage: lifecycleStage,
		OrganizationID: organizationID,
		UserID:         userID,
		Slug:           slug,
	})
	if err != nil {
		if isNoRows(err) {
			return nil, kaitenerrors.NotFound("PatchInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	return updateInstanceLifecycleStageRowToSchema(i)
}

func getOneInstanceRowToSchema(i db.GetOneInstanceRow) (*schema.Instance, error) {
	return rowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.CreatedByID, i.CreatedByName, i.CreatedAt.Time,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt.Time, i.Name, i.Description,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug, i.DeploymentZoneID, i.DeploymentZoneSlug,
		i.StartLicenseDate.Time, i.EndLicenseDate.Time, i.Metadata,
	)
}

func updateInstanceStatusRowToSchema(i db.UpdateInstanceStatusRow) (*schema.Instance, error) {
	return rowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.CreatedByID, i.CreatedByName, i.CreatedAt.Time,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt.Time, i.Name, i.Description,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug, i.DeploymentZoneID, i.DeploymentZoneSlug,
		i.StartLicenseDate.Time, i.EndLicenseDate.Time, i.Metadata,
	)
}

func updateInstanceLifecycleStageRowToSchema(i db.UpdateInstanceLifecycleStageRow) (*schema.Instance, error) {
	return rowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.CreatedByID, i.CreatedByName, i.CreatedAt.Time,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt.Time, i.Name, i.Description,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug, i.DeploymentZoneID, i.DeploymentZoneSlug,
		i.StartLicenseDate.Time, i.EndLicenseDate.Time, i.Metadata,
	)
}

func rowToSchema(id uuid.UUID, slug string, status schema.InstanceStatus, lifecycleStage *string, createdByID uuid.UUID, createdByName string, createdAt time.Time, updatedByID uuid.UUID, updatedByName string, updatedAt time.Time, name string, description string, customerID uuid.UUID, customerSlugPtr *string, licenseID uuid.UUID, licenseSlugPtr *string, deploymentZoneID *uuid.UUID, deploymentZoneSlug *string, startLicenseDate time.Time, endLicenseDate time.Time, metadataBytes []byte) (*schema.Instance, error) {
	metadata, err := schema.UnmarshalJSONObject(metadataBytes)
	if err != nil {
		return nil, err
	}

	licenseSlug := ""
	if licenseSlugPtr != nil {
		licenseSlug = *licenseSlugPtr
	}

	customerSlug := ""
	if customerSlugPtr != nil {
		customerSlug = *customerSlugPtr
	}

	return &schema.Instance{
		ID:                 id,
		Name:               name,
		Slug:               slug,
		Description:        description,
		CreatedBy:          shared.User{ID: createdByID, Name: createdByName},
		CreatedAt:          createdAt,
		UpdatedBy:          shared.User{ID: updatedByID, Name: updatedByName},
		UpdatedAt:          updatedAt,
		Status:             status,
		LifecycleStage:     lifecycleStage,
		CustomerID:         customerID,
		CustomerSlug:       customerSlug,
		LicenseID:          licenseID,
		LicenseSlug:        licenseSlug,
		DeploymentZoneID:   deploymentZoneID,
		DeploymentZoneSlug: deploymentZoneSlug,
		StartLicenseDate:   startLicenseDate,
		EndLicenseDate:     endLicenseDate,
		Metadata:           metadata,
	}, nil
}

func isNoRows(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows)
}
