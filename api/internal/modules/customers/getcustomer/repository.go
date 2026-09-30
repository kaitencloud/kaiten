package getcustomer

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
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

func (r *QueryRepository) GetCustomerBySlug(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.Customer, error) {
	params := db.GetOneCustomerParams{
		OrganizationID: organizationID,
		Slug:           slug,
	}

	c, err := r.repository.GetOneCustomer(ctx, params)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, kaitenerrors.NotFound("Customer.NotFound", fmt.Sprintf("Customer with slug %q not found", slug))
		}
		return nil, err
	}

	integrations, err := r.getCustomerIntegrations(ctx, organizationID, c.ID)
	if err != nil {
		return nil, err
	}

	return &schema.Customer{
		ID:                 c.ID,
		Name:               c.Name,
		Slug:               c.Slug,
		ExternalCustomerID: c.ExternalCustomerID,
		Domain:             c.Domain,
		Integrations:       integrations,
		CreatedBy:          shared.User{ID: c.CreatedByID, Name: c.CreatedByName},
		UpdatedBy:          shared.User{ID: c.UpdatedByID, Name: c.UpdatedByName},
		CreatedAt:          c.CreatedAt.Time,
		UpdatedAt:          c.UpdatedAt.Time,
	}, nil
}

func (r *QueryRepository) getCustomerIntegrations(ctx context.Context, organizationID, customerID uuid.UUID) (map[string]schema.CustomerIntegration, error) {
	rows, err := r.repository.GetCustomerIntegrations(ctx, db.GetCustomerIntegrationsParams{
		OrganizationID: organizationID,
		CustomerID:     customerID,
	})
	if err != nil {
		return nil, err
	}

	integrations := make(map[string]schema.CustomerIntegration, len(rows))
	for _, row := range rows {
		metadata, err := unmarshalIntegrationMetadata(row.Metadata)
		if err != nil {
			return nil, err
		}

		integrations[row.Adapter] = schema.CustomerIntegration{
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
