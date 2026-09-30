package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// GetCustomers returns a cursor-paginated page of customers for the current
// organization, optionally restricted to those linked to an integration
// adapter.
//
// The hasIntegration filter is a predicate of the keyset-paginated query
// itself, so a filtered request pages exactly like an unfiltered one:
// same clamped limit, same cursor, same honest HasMore.
func GetCustomers(ctx context.Context, queries *db.Queries, hasIntegration *string, limit int32, cursor *string) (*schema.CustomerPage, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	l := pagination.ClampLimit(limit)

	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			// Bad input, not a server fault -- typed so presentError keeps the
			// message, under the code GET /customers already reports.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "Customers.InvalidCursor", "invalid cursor")
		}
		cursorCreatedAt = &key.CreatedAt
		cursorID = &key.ID
	}

	customers, err := queries.GetCustomers(ctx, db.GetCustomersParams{
		OrganizationID:  i.OrganizationID,
		Adapter:         hasIntegration,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    l + 1,
	})
	if err != nil {
		return nil, err
	}

	page, err := pagination.BuildPage(toCustomerSchemasFromGetCustomersRows(customers), l, func(c schema.Customer) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: c.CreatedAt, ID: c.ID}
	})
	if err != nil {
		return nil, err
	}

	return &schema.CustomerPage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// ErrAmbiguousExternalCustomerID is returned when more than one customer in the
// organization carries the requested external ID. The column has no uniqueness
// constraint, so the caller is told rather than handed an arbitrary row.
//
// It is a typed error because the caller is *meant* to read it: the GraphQL
// error presenter withholds the text of anything untyped, on the assumption
// that a raw error describes internals rather than the request.
var ErrAmbiguousExternalCustomerID = apierrors.Conflict(
	"Customer.AmbiguousExternalCustomerID",
	"several customers share this external customer ID",
)

// GetCustomer returns a single customer by ID, slug, or external customer ID.
func GetCustomer(
	ctx context.Context,
	queries *db.Queries,
	id *uuid.UUID,
	slug *string,
	externalCustomerID *string,
) (*schema.Customer, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	if id != nil {
		customers, err := queries.GetCustomersByIDs(ctx, db.GetCustomersByIDsParams{
			OrganizationID: i.OrganizationID,
			CustomerIds:    []uuid.UUID{*id},
		})
		if err != nil {
			return nil, err
		}
		if len(customers) == 0 {
			return nil, nil
		}
		result := toCustomerSchema(customers[0])
		return &result, nil
	}

	if slug != nil {
		row, err := queries.GetOneCustomer(ctx, db.GetOneCustomerParams{
			OrganizationID: i.OrganizationID,
			Slug:           *slug,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		result := toCustomerSchemaFromGetOneCustomerRow(row)
		return &result, nil
	}

	if externalCustomerID != nil {
		rows, err := queries.GetCustomersByExternalID(ctx, db.GetCustomersByExternalIDParams{
			OrganizationID:     i.OrganizationID,
			ExternalCustomerID: externalCustomerID,
		})
		if err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			return nil, nil
		}
		if len(rows) > 1 {
			return nil, ErrAmbiguousExternalCustomerID
		}
		result := toCustomerSchemaFromGetCustomersByExternalIDRow(rows[0])
		return &result, nil
	}

	return nil, nil
}

// LoadCustomer loads a customer using the dataloader.
func LoadCustomer(ctx context.Context, id uuid.UUID) (*schema.Customer, error) {
	loader, err := GetCustomerLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, id)
	customer, err := thunk()
	if err != nil {
		return nil, err
	}

	result := toCustomerSchema(customer)
	return &result, nil
}

// LoadCustomerIntegrations loads integrations for one customer using the dataloader.
func LoadCustomerIntegrations(ctx context.Context, customerID uuid.UUID) (map[string]schema.CustomerIntegration, error) {
	loader, err := GetCustomerIntegrationsLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, customerID)
	rows, err := thunk()
	if err != nil {
		return nil, err
	}

	return toCustomerIntegrations(rows)
}

func toCustomerIntegrations(rows []db.GetCustomerIntegrationsByCustomerIDsRow) (map[string]schema.CustomerIntegration, error) {
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
