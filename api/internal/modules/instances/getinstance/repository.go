package getinstance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetInstance(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.Instance, error) {
	params := db.GetOneInstanceParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	i, err := r.repository.GetOneInstance(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("GetInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	metadata, err := schema.UnmarshalJSONObject(i.Metadata)
	if err != nil {
		return nil, err
	}

	integrations, err := r.getInstanceIntegrations(ctx, organizationID, i.ID)
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

func (r *QueryRepository) getInstanceIntegrations(ctx context.Context, organizationID, instanceID uuid.UUID) (map[string]schema.InstanceIntegration, error) {
	rows, err := r.repository.GetInstanceIntegrations(ctx, db.GetInstanceIntegrationsParams{
		OrganizationID: organizationID,
		InstanceID:     instanceID,
	})
	if err != nil {
		return nil, err
	}

	integrations := make(map[string]schema.InstanceIntegration, len(rows))
	for _, row := range rows {
		metadata, err := unmarshalIntegrationMetadata(row.Metadata)
		if err != nil {
			return nil, err
		}

		integrations[row.Adapter] = schema.InstanceIntegration{
			ExternalID: row.ExternalID,
			Metadata:   metadata,
			WebURL:     row.WebUrl,
			SyncedAt:   pgtime.PgTimestamptzToTime(row.SyncedAt),
			LastError:  row.LastError,
		}
	}

	return integrations, nil
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
