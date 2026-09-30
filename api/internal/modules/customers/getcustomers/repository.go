package getcustomers

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
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

func (r *QueryRepository) GetCustomers(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.Customer, error) {
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	result, err := r.repository.GetCustomers(ctx, db.GetCustomersParams{
		OrganizationID:  organizationID,
		Adapter:         nil, // REST getcustomers has no integration filter
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	customerIDs := make([]uuid.UUID, 0, len(result))
	for _, c := range result {
		customerIDs = append(customerIDs, c.ID)
	}

	integrationsByCustomerID := make(map[uuid.UUID]map[string]schema.CustomerIntegration)
	if len(customerIDs) > 0 {
		rows, err := r.repository.GetCustomerIntegrationsByCustomerIDs(ctx, db.GetCustomerIntegrationsByCustomerIDsParams{
			OrganizationID: organizationID,
			CustomerIds:    customerIDs,
		})
		if err != nil {
			return nil, err
		}

		for _, row := range rows {
			metadata, err := unmarshalIntegrationMetadata(row.Metadata)
			if err != nil {
				return nil, err
			}

			if _, ok := integrationsByCustomerID[row.CustomerID]; !ok {
				integrationsByCustomerID[row.CustomerID] = make(map[string]schema.CustomerIntegration)
			}

			integrationsByCustomerID[row.CustomerID][row.Adapter] = schema.CustomerIntegration{
				ExternalID: row.ExternalID,
				Metadata:   metadata,
				WebURL:     row.WebUrl,
				SyncedAt:   pgtime.PgTimestamptzToTime(row.SyncedAt),
				LastError:  row.LastError,
			}
		}
	}

	customers := make([]*schema.Customer, 0)

	for _, c := range result {
		integrations := integrationsByCustomerID[c.ID]
		if integrations == nil {
			integrations = map[string]schema.CustomerIntegration{}
		}

		customers = append(customers, &schema.Customer{
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
		})
	}

	return customers, nil
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
