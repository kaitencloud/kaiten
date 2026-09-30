package getinstances

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetInstances(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.Instance, error) {
	instances := make([]*schema.Instance, 0)
	instanceIDs := make([]uuid.UUID, 0)
	var integrationsByInstanceID map[uuid.UUID]map[string]schema.InstanceIntegration

	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	results, err := r.repository.GetAllInstancesByCursor(ctx, db.GetAllInstancesByCursorParams{
		OrganizationID:  organizationID,
		Adapter:         nil, // REST getinstances has no integration filter
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	for _, i := range results {
		instanceIDs = append(instanceIDs, i.ID)
	}

	integrationsByInstanceID, err = r.getIntegrationsByInstanceIDs(ctx, organizationID, instanceIDs)
	if err != nil {
		return nil, err
	}

	for _, i := range results {
		inst, err := rowToSchema(i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.CreatedByID, i.CreatedByName, i.CreatedAt.Time, i.UpdatedByID, i.UpdatedByName, i.UpdatedAt.Time, i.Name, i.Description, i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug, i.DeploymentZoneID, i.DeploymentZoneSlug, i.StartLicenseDate.Time, i.EndLicenseDate.Time, i.Metadata)
		if err != nil {
			return nil, err
		}
		integrations := integrationsByInstanceID[i.ID]
		if integrations == nil {
			integrations = map[string]schema.InstanceIntegration{}
		}
		inst.Integrations = integrations
		instances = append(instances, inst)
	}

	return instances, nil
}

func (r *QueryRepository) getIntegrationsByInstanceIDs(ctx context.Context, organizationID uuid.UUID, instanceIDs []uuid.UUID) (map[uuid.UUID]map[string]schema.InstanceIntegration, error) {
	integrationsByInstanceID := make(map[uuid.UUID]map[string]schema.InstanceIntegration)
	if len(instanceIDs) == 0 {
		return integrationsByInstanceID, nil
	}

	rows, err := r.repository.GetInstanceIntegrationsByInstanceIDs(ctx, db.GetInstanceIntegrationsByInstanceIDsParams{
		OrganizationID: organizationID,
		InstanceIds:    instanceIDs,
	})
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		metadata, err := unmarshalIntegrationMetadata(row.Metadata)
		if err != nil {
			return nil, err
		}

		if _, ok := integrationsByInstanceID[row.InstanceID]; !ok {
			integrationsByInstanceID[row.InstanceID] = make(map[string]schema.InstanceIntegration)
		}

		integrationsByInstanceID[row.InstanceID][row.Adapter] = schema.InstanceIntegration{
			ExternalID: row.ExternalID,
			Metadata:   metadata,
			WebURL:     row.WebUrl,
			SyncedAt:   pgtime.PgTimestamptzToTime(row.SyncedAt),
			LastError:  row.LastError,
		}
	}

	return integrationsByInstanceID, nil
}

func unmarshalIntegrationMetadata(raw []byte) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}

	var metadata map[string]any
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return nil, err
	}
	if metadata == nil {
		return map[string]any{}, nil
	}

	return metadata, nil
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
