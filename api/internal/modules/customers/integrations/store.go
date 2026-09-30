package integrations

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/integrationurl"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Store struct {
	queries *db.Queries
}

type UpsertInput struct {
	ExternalID string
	Metadata   map[string]any
	WebURL     *string
	LastError  *string
}

func NewStore(queries *db.Queries) *Store {
	return &Store{queries: queries}
}

func (s *Store) Get(ctx context.Context, organizationID uuid.UUID, customerSlug, integrationName string) (*schema.CustomerIntegration, error) {
	adapter, err := normalizeAdapter(integrationName, "GetCustomerIntegration.InvalidIntegrationName")
	if err != nil {
		return nil, err
	}

	customerID, err := s.resolveCustomerID(ctx, organizationID, customerSlug, "GetCustomerIntegration.CustomerNotFound")
	if err != nil {
		return nil, err
	}

	row, err := s.queries.GetCustomerIntegration(ctx, db.GetCustomerIntegrationParams{
		OrganizationID: organizationID,
		CustomerID:     customerID,
		Adapter:        adapter,
	})
	if err != nil {
		if isNoRowsError(err) {
			return nil, kaitenerrors.NotFound(
				"GetCustomerIntegration.NotFound",
				fmt.Sprintf("Integration %q not found for customer %q", adapter, customerSlug),
			)
		}
		return nil, err
	}

	return rowToIntegration(row)
}

func (s *Store) Create(ctx context.Context, organizationID uuid.UUID, customerSlug, integrationName string, input UpsertInput) (*schema.CustomerIntegration, error) {
	adapter, err := normalizeAdapter(integrationName, "CreateCustomerIntegration.InvalidIntegrationName")
	if err != nil {
		return nil, err
	}

	customerID, err := s.resolveCustomerID(ctx, organizationID, customerSlug, "CreateCustomerIntegration.CustomerNotFound")
	if err != nil {
		return nil, err
	}

	_, err = s.queries.GetCustomerIntegration(ctx, db.GetCustomerIntegrationParams{
		OrganizationID: organizationID,
		CustomerID:     customerID,
		Adapter:        adapter,
	})
	if err == nil {
		return nil, kaitenerrors.Conflict(
			"CreateCustomerIntegration.AlreadyExists",
			fmt.Sprintf("Integration %q already exists for customer %q", adapter, customerSlug),
		)
	}
	if err != nil && !isNoRowsError(err) {
		return nil, err
	}

	return s.upsertIntegration(ctx, organizationID, customerID, customerSlug, adapter, "CreateCustomerIntegration", input)
}

func (s *Store) Update(ctx context.Context, organizationID uuid.UUID, customerSlug, integrationName string, input UpsertInput) (*schema.CustomerIntegration, error) {
	adapter, err := normalizeAdapter(integrationName, "UpdateCustomerIntegration.InvalidIntegrationName")
	if err != nil {
		return nil, err
	}

	customerID, err := s.resolveCustomerID(ctx, organizationID, customerSlug, "UpdateCustomerIntegration.CustomerNotFound")
	if err != nil {
		return nil, err
	}

	_, err = s.queries.GetCustomerIntegration(ctx, db.GetCustomerIntegrationParams{
		OrganizationID: organizationID,
		CustomerID:     customerID,
		Adapter:        adapter,
	})
	if err != nil {
		if isNoRowsError(err) {
			return nil, kaitenerrors.NotFound(
				"UpdateCustomerIntegration.NotFound",
				fmt.Sprintf("Integration %q not found for customer %q", adapter, customerSlug),
			)
		}
		return nil, err
	}

	return s.upsertIntegration(ctx, organizationID, customerID, customerSlug, adapter, "UpdateCustomerIntegration", input)
}

func (s *Store) Delete(ctx context.Context, organizationID uuid.UUID, customerSlug, integrationName string) error {
	adapter, err := normalizeAdapter(integrationName, "DeleteCustomerIntegration.InvalidIntegrationName")
	if err != nil {
		return err
	}

	customerID, err := s.resolveCustomerID(ctx, organizationID, customerSlug, "DeleteCustomerIntegration.CustomerNotFound")
	if err != nil {
		return err
	}

	rows, err := s.queries.DeleteCustomerIntegration(ctx, db.DeleteCustomerIntegrationParams{
		OrganizationID: organizationID,
		CustomerID:     customerID,
		Adapter:        adapter,
	})
	if err != nil {
		return err
	}
	if rows == 0 {
		return kaitenerrors.NotFound(
			"DeleteCustomerIntegration.NotFound",
			fmt.Sprintf("Integration %q not found for customer %q", adapter, customerSlug),
		)
	}

	return nil
}

func (s *Store) upsertIntegration(ctx context.Context, organizationID, customerID uuid.UUID, customerSlug, adapter, operation string, input UpsertInput) (*schema.CustomerIntegration, error) {
	prepared, err := prepareUpsertInput(operation, adapter, input)
	if err != nil {
		return nil, err
	}

	syncedAt := time.Now().UTC()

	rows, err := s.queries.UpsertCustomerIntegration(ctx, db.UpsertCustomerIntegrationParams{
		OrganizationID: organizationID,
		CustomerID:     customerID,
		Adapter:        adapter,
		ExternalID:     prepared.externalID,
		Metadata:       prepared.metadataBytes,
		WebUrl:         prepared.webURL,
		SyncedAt:       pgtime.TimePtrToPgTimestamptz(&syncedAt),
		LastError:      prepared.lastError,
	})
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict(
				operation+".ExternalIDConflict",
				fmt.Sprintf("Integration external_id %q is already used for adapter %q", prepared.externalID, adapter),
			)
		}
		return nil, err
	}
	if rows == 0 {
		return nil, kaitenerrors.NotFound(
			operation+".CustomerNotFound",
			fmt.Sprintf("Customer with slug %q not found", customerSlug),
		)
	}

	return &schema.CustomerIntegration{
		ExternalID: prepared.externalID,
		Metadata:   prepared.metadata,
		WebURL:     prepared.webURL,
		SyncedAt:   syncedAt,
		LastError:  prepared.lastError,
	}, nil
}

func (s *Store) resolveCustomerID(ctx context.Context, organizationID uuid.UUID, customerSlug, errorCode string) (uuid.UUID, error) {
	row, err := s.queries.GetOneCustomer(ctx, db.GetOneCustomerParams{
		OrganizationID: organizationID,
		Slug:           customerSlug,
	})
	if err != nil {
		if isNoRowsError(err) {
			return uuid.Nil, kaitenerrors.NotFound(
				errorCode,
				fmt.Sprintf("Customer with slug %q not found", customerSlug),
			)
		}
		return uuid.Nil, err
	}

	return row.ID, nil
}

func rowToIntegration(row db.GetCustomerIntegrationRow) (*schema.CustomerIntegration, error) {
	metadata, err := unmarshalMetadata(row.Metadata)
	if err != nil {
		return nil, err
	}

	return &schema.CustomerIntegration{
		ExternalID: row.ExternalID,
		Metadata:   metadata,
		WebURL:     row.WebUrl,
		SyncedAt:   pgtime.PgTimestamptzToTime(row.SyncedAt),
		LastError:  row.LastError,
	}, nil
}

type preparedUpsertInput struct {
	externalID    string
	metadata      map[string]any
	metadataBytes []byte
	webURL        *string
	lastError     *string
}

func prepareUpsertInput(operation, adapter string, input UpsertInput) (preparedUpsertInput, error) {
	externalID := strings.TrimSpace(input.ExternalID)
	if externalID == "" {
		return preparedUpsertInput{}, kaitenerrors.Validation(
			operation+".InvalidExternalID",
			fmt.Sprintf("Integration %q external_id is required", adapter),
		)
	}

	metadata := input.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}

	metadataBytes, err := json.Marshal(metadata)
	if err != nil {
		return preparedUpsertInput{}, kaitenerrors.Validation(
			operation+".InvalidMetadata",
			fmt.Sprintf("Integration %q metadata must be a valid JSON object", adapter),
		)
	}

	webURL, err := integrationurl.Normalize(input.WebURL)
	if err != nil {
		return preparedUpsertInput{}, kaitenerrors.Validation(
			operation+".InvalidWebURL",
			fmt.Sprintf("Integration %q web_url must be an absolute http(s) URL", adapter),
		)
	}

	return preparedUpsertInput{
		externalID:    externalID,
		metadata:      metadata,
		metadataBytes: metadataBytes,
		webURL:        webURL,
		lastError:     normalizeOptionalString(input.LastError),
	}, nil
}

func normalizeAdapter(adapter, code string) (string, error) {
	normalized := strings.TrimSpace(adapter)
	if normalized == "" {
		return "", kaitenerrors.Validation(code, "Integration name cannot be empty")
	}

	return normalized, nil
}

func unmarshalMetadata(raw []byte) (map[string]any, error) {
	if len(raw) == 0 || string(raw) == "null" {
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

func isNoRowsError(err error) bool {
	return errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows)
}
