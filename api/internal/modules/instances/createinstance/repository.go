package createinstance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/integrationurl"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
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

func (r *CommandRepository) CreateInstance(
	ctx context.Context,
	command *Command,
	userID, organizationID uuid.UUID,
) (*schema.Instance, error) {
	metadataBytes, err := schema.MarshalJSONObject(command.Metadata)
	if err != nil {
		return nil, err
	}

	slug := *command.Slug

	params := db.CreateInstanceParams{
		Name:             command.Name,
		Slug:             slug,
		Description:      command.Description,
		CustomerID:       command.CustomerID,
		LicenseID:        command.LicenseID,
		DeploymentZoneID: command.DeploymentZoneID,
		StartLicenseDate: pgtype.Timestamp{Time: command.StartLicenseDate, Valid: !command.StartLicenseDate.IsZero()},
		EndLicenseDate:   pgtype.Timestamp{Time: command.EndLicenseDate, Valid: !command.EndLicenseDate.IsZero()},
		Metadata:         metadataBytes,
		UserID:           userID,
		OrganizationID:   organizationID,
	}

	queries := r.q(ctx)

	i, err := queries.CreateInstance(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.Forbidden(
				"CurrentUser.NotInOrganization",
				fmt.Sprintf("User %s does not belong to organization %s", userID, organizationID),
			)
		}
		// The three instance FKs switched on below are composite on
		// (id, organization_id), so a customer, license or deployment zone
		// belonging to another organization violates them exactly like a
		// nonexistent one -- and reports as not found, which is also what
		// stops the response being a cross-tenant existence oracle.
		if kaitenerrors.IsCheckViolationOnConstraint(err, instanceLicenseNotArchivedConstraint) {
			return nil, kaitenerrors.UnprocessableEntity(
				"CreateInstance.LicenseArchived",
				fmt.Sprintf("License with ID %s is archived and can no longer be assigned to an instance; choose a published or draft version", command.LicenseID),
			)
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.ConstraintName {
			case instanceCustomerConstraint:
				return nil, kaitenerrors.NotFound(
					"CreateInstance.CustomerNotFound",
					fmt.Sprintf("Customer with ID %s was not found", command.CustomerID),
				)
			case instanceLicenseConstraint:
				return nil, kaitenerrors.NotFound(
					"CreateInstance.LicenseNotFound",
					fmt.Sprintf("License with ID %s was not found", command.LicenseID),
				)
			case instanceDeploymentZoneConstraint:
				// Unreachable with a nil zone: the foreign key is MATCH SIMPLE,
				// so a NULL deployment_zone_id skips the check and cannot be
				// what raised this.
				return nil, kaitenerrors.NotFound(
					"CreateInstance.DeploymentZoneNotFound",
					fmt.Sprintf("Deployment zone with ID %s was not found", *command.DeploymentZoneID),
				)
			}
		}
		if kaitenerrors.IsUniqueViolation(err) {
			// instance's only UNIQUE constraint besides the primary key and
			// the FKs switched on above is (organization_id, slug), so any
			// remaining unique violation here is a slug conflict. Wrapping
			// slugutil.ErrConflict lets slugutil.Retry recognize this as
			// retryable when the slug was auto-generated.
			return nil, kaitenerrors.Wrap(slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateInstance.SlugConflict", fmt.Sprintf("Instance with slug %q already exists in this organization", slug))
		}
		return nil, err
	}

	integrations, err := r.upsertInstanceIntegrations(ctx, queries, organizationID, i.ID, command.Integrations)
	if err != nil {
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
		Integrations:       integrations,
	}, nil
}

func (r *CommandRepository) upsertInstanceIntegrations(ctx context.Context, queries *db.Queries, organizationID, instanceID uuid.UUID, input map[string]schema.InstanceIntegration) (map[string]schema.InstanceIntegration, error) {
	// nil (not an empty map) so created entities match what GET endpoints
	// return: `integrations` is omitted from JSON when there is none.
	if len(input) == 0 {
		return nil, nil
	}
	integrations := make(map[string]schema.InstanceIntegration, len(input))

	for rawAdapter, integration := range input {
		adapter := strings.TrimSpace(rawAdapter)
		if adapter == "" {
			return nil, kaitenerrors.Validation("CreateInstance.InvalidIntegrationAdapter", "Integration adapter key cannot be empty")
		}
		if _, exists := integrations[adapter]; exists {
			return nil, kaitenerrors.Validation("CreateInstance.DuplicateIntegrationAdapter", fmt.Sprintf("Duplicate integration adapter %q", adapter))
		}

		externalID := strings.TrimSpace(integration.ExternalID)
		if externalID == "" {
			return nil, kaitenerrors.Validation("CreateInstance.InvalidIntegrationExternalID", fmt.Sprintf("Integration %q external_id is required", adapter))
		}

		metadataBytes, err := schema.MarshalJSONObject(integration.Metadata)
		if err != nil {
			return nil, kaitenerrors.Validation("CreateInstance.InvalidIntegrationMetadata", fmt.Sprintf("Integration %q metadata must be a valid JSON object", adapter))
		}

		webURL, err := integrationurl.Normalize(integration.WebURL)
		if err != nil {
			return nil, kaitenerrors.Validation("CreateInstance.InvalidIntegrationWebURL", fmt.Sprintf("Integration %q web_url must be an absolute http(s) URL", adapter))
		}

		lastError := normalizeOptionalString(integration.LastError)
		syncedAt := time.Now().UTC()

		rows, err := queries.UpsertInstanceIntegration(ctx, db.UpsertInstanceIntegrationParams{
			OrganizationID: organizationID,
			InstanceID:     instanceID,
			Adapter:        adapter,
			ExternalID:     externalID,
			Metadata:       metadataBytes,
			WebUrl:         webURL,
			SyncedAt:       pgtime.TimePtrToPgTimestamptz(&syncedAt),
			LastError:      lastError,
		})
		if err != nil {
			return nil, err
		}
		if rows == 0 {
			return nil, kaitenerrors.NotFound("CreateInstance.NotFound", fmt.Sprintf("Instance with ID %s not found", instanceID))
		}

		integrations[adapter] = schema.InstanceIntegration{
			ExternalID: externalID,
			Metadata:   schema.NormalizeJSONObject(integration.Metadata),
			WebURL:     webURL,
			SyncedAt:   syncedAt,
			LastError:  lastError,
		}
	}

	return integrations, nil
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}
