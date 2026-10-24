package updateinstance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	instanceCustomerConstraint       = "instance_customer_id_fkey"
	instanceLicenseConstraint        = "instance_license_id_fkey"
	instanceDeploymentZoneConstraint = "instance_deployment_zone_id_fkey"

	// instanceLicenseNotArchivedConstraint is the name the
	// instance_license_not_archived trigger raises under: an archived
	// license version is withdrawn from sale, so it cannot be assigned to an
	// instance, while instances already pinned to it keep it.
	instanceLicenseNotArchivedConstraint = "instance_license_not_archived"
	// instanceBillingFreezeConstraint is what the instance_billing_freeze
	// trigger raises under: while the instance has a live subscription, its
	// customer and licence are the contract being billed.
	instanceBillingFreezeConstraint = "instance_billing_freeze"
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
	params := db.GetOneInstanceParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	i, err := r.q(ctx).GetOneInstance(ctx, params)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, kaitenerrors.NotFound("GetInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	metadata, err := schema.UnmarshalJSONObject(i.Metadata)
	if err != nil {
		return nil, err
	}

	licenseSlug := ""
	if i.LicenseSlug != nil {
		licenseSlug = *i.LicenseSlug
	}

	customerSlug := ""
	if i.CustomerSlug != nil {
		customerSlug = *i.CustomerSlug
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
		CustomerSlug:       customerSlug,
		LicenseID:          i.LicenseID,
		LicenseSlug:        licenseSlug,
		DeploymentZoneID:   i.DeploymentZoneID,
		DeploymentZoneSlug: i.DeploymentZoneSlug,
		StartLicenseDate:   i.StartLicenseDate.Time,
		EndLicenseDate:     i.EndLicenseDate.Time,
		Metadata:           metadata,
	}, nil
}

func (r *CommandRepository) UpdateInstance(ctx context.Context, command *Command, slug string, userID uuid.UUID, organizationID uuid.UUID) (*schema.Instance, error) {
	metadataBytes, err := schema.MarshalJSONObject(command.Metadata)
	if err != nil {
		return nil, err
	}

	params := db.EditInstanceParams{
		Slug:             slug,
		OrganizationID:   organizationID,
		UserID:           userID,
		Name:             command.Name,
		Description:      command.Description,
		CustomerID:       command.CustomerID,
		LicenseID:        command.LicenseID,
		DeploymentZoneID: command.DeploymentZoneID,
		StartLicenseDate: pgtype.Timestamp{Time: command.StartLicenseDate, Valid: !command.StartLicenseDate.IsZero()},
		EndLicenseDate:   pgtype.Timestamp{Time: command.EndLicenseDate, Valid: !command.EndLicenseDate.IsZero()},
		Metadata:         metadataBytes,
		NewSlug:          command.Slug,
	}

	i, err := r.q(ctx).EditInstance(ctx, params)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		// The instance FKs are composite on (id, organization_id), so a
		// customer, license or deployment zone belonging to another
		// organization violates them exactly like a nonexistent one -- and
		// reports as not found, which is also what stops the response being a
		// cross-tenant existence oracle.
		if kaitenerrors.IsCheckViolationOnConstraint(err, instanceLicenseNotArchivedConstraint) {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateInstance.LicenseArchived",
				fmt.Sprintf("License with ID %s is archived and can no longer be assigned to an instance; choose a published or draft version", command.LicenseID),
			)
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.ConstraintName {
			case instanceBillingFreezeConstraint:
				return nil, kaitenerrors.Conflict(
					"UpdateInstance.BillingActive",
					fmt.Sprintf("Instance %q has a live subscription: its customer and license cannot change until it is canceled", slug),
				)
			case instanceCustomerConstraint:
				return nil, kaitenerrors.NotFound(
					"UpdateInstance.CustomerNotFound",
					fmt.Sprintf("Customer with ID %s was not found", command.CustomerID),
				)
			case instanceLicenseConstraint:
				return nil, kaitenerrors.NotFound(
					"UpdateInstance.LicenseNotFound",
					fmt.Sprintf("License with ID %s was not found", command.LicenseID),
				)
			case instanceDeploymentZoneConstraint:
				// Unreachable with a nil zone: the foreign key is MATCH SIMPLE,
				// so a NULL deployment_zone_id skips the check and cannot be
				// what raised this.
				return nil, kaitenerrors.NotFound(
					"UpdateInstance.DeploymentZoneNotFound",
					fmt.Sprintf("Deployment zone with ID %s was not found", *command.DeploymentZoneID),
				)
			}
		}
		if command.Slug != nil && kaitenerrors.IsUniqueViolation(err) {
			// instance's only UNIQUE constraint besides the primary key and
			// the FKs switched on above is (organization_id, slug), so a
			// unique violation from a request that asked for a rename is that
			// slug being taken by another instance -- renaming to the slug the
			// instance already has updates its own row and conflicts with
			// nothing. Unlike createinstance this does not wrap
			// slugutil.ErrConflict: the slug is always the caller's here, so
			// there is nothing to regenerate and retry.
			return nil, kaitenerrors.Conflict(
				"UpdateInstance.SlugConflict",
				fmt.Sprintf("Instance with slug %q already exists in this organization", *command.Slug),
			)
		}
		return nil, err
	}

	metadata, err := schema.UnmarshalJSONObject(i.Metadata)
	if err != nil {
		return nil, err
	}

	licenseSlug := ""
	if i.LicenseSlug != nil {
		licenseSlug = *i.LicenseSlug
	}

	customerSlug := ""
	if i.CustomerSlug != nil {
		customerSlug = *i.CustomerSlug
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
		CustomerSlug:       customerSlug,
		LicenseID:          i.LicenseID,
		LicenseSlug:        licenseSlug,
		DeploymentZoneID:   i.DeploymentZoneID,
		DeploymentZoneSlug: i.DeploymentZoneSlug,
		StartLicenseDate:   i.StartLicenseDate.Time,
		EndLicenseDate:     i.EndLicenseDate.Time,
		Metadata:           metadata,
	}, nil
}
