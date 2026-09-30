package integrations

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
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

func (s *Store) Get(ctx context.Context, organizationID uuid.UUID, instanceSlug, integrationName string) (*schema.InstanceIntegration, error) {
	adapter, err := normalizeAdapter(integrationName, "GetInstanceIntegration.InvalidIntegrationName")
	if err != nil {
		return nil, err
	}

	instanceID, err := s.resolveInstanceID(ctx, organizationID, instanceSlug, "GetInstanceIntegration.InstanceNotFound")
	if err != nil {
		return nil, err
	}

	row, err := s.queries.GetInstanceIntegration(ctx, db.GetInstanceIntegrationParams{
		OrganizationID: organizationID,
		InstanceID:     instanceID,
		Adapter:        adapter,
	})
	if err != nil {
		if isNoRowsError(err) {
			return nil, kaitenerrors.NotFound(
				"GetInstanceIntegration.NotFound",
				fmt.Sprintf("Integration %q not found for instance %q", adapter, instanceSlug),
			)
		}
		return nil, err
	}

	return rowToIntegration(row)
}

func (s *Store) Create(ctx context.Context, organizationID uuid.UUID, instanceSlug, integrationName string, input UpsertInput) (*schema.InstanceIntegration, error) {
	adapter, err := normalizeAdapter(integrationName, "CreateInstanceIntegration.InvalidIntegrationName")
	if err != nil {
		return nil, err
	}

	instanceID, err := s.resolveInstanceID(ctx, organizationID, instanceSlug, "CreateInstanceIntegration.InstanceNotFound")
	if err != nil {
		return nil, err
	}

	_, err = s.queries.GetInstanceIntegration(ctx, db.GetInstanceIntegrationParams{
		OrganizationID: organizationID,
		InstanceID:     instanceID,
		Adapter:        adapter,
	})
	if err == nil {
		return nil, kaitenerrors.Conflict(
			"CreateInstanceIntegration.AlreadyExists",
			fmt.Sprintf("Integration %q already exists for instance %q", adapter, instanceSlug),
		)
	}
	if err != nil && !isNoRowsError(err) {
		return nil, err
	}

	return s.upsertIntegration(ctx, organizationID, instanceID, instanceSlug, adapter, "CreateInstanceIntegration", input)
}

func (s *Store) Update(ctx context.Context, organizationID uuid.UUID, instanceSlug, integrationName string, input UpsertInput) (*schema.InstanceIntegration, error) {
	adapter, err := normalizeAdapter(integrationName, "UpdateInstanceIntegration.InvalidIntegrationName")
	if err != nil {
		return nil, err
	}

	instanceID, err := s.resolveInstanceID(ctx, organizationID, instanceSlug, "UpdateInstanceIntegration.InstanceNotFound")
	if err != nil {
		return nil, err
	}

	_, err = s.queries.GetInstanceIntegration(ctx, db.GetInstanceIntegrationParams{
		OrganizationID: organizationID,
		InstanceID:     instanceID,
		Adapter:        adapter,
	})
	if err != nil {
		if isNoRowsError(err) {
			return nil, kaitenerrors.NotFound(
				"UpdateInstanceIntegration.NotFound",
				fmt.Sprintf("Integration %q not found for instance %q", adapter, instanceSlug),
			)
		}
		return nil, err
	}

	return s.upsertIntegration(ctx, organizationID, instanceID, instanceSlug, adapter, "UpdateInstanceIntegration", input)
}

func (s *Store) Delete(ctx context.Context, organizationID uuid.UUID, instanceSlug, integrationName string) error {
	adapter, err := normalizeAdapter(integrationName, "DeleteInstanceIntegration.InvalidIntegrationName")
	if err != nil {
		return err
	}

	instanceID, err := s.resolveInstanceID(ctx, organizationID, instanceSlug, "DeleteInstanceIntegration.InstanceNotFound")
	if err != nil {
		return err
	}

	rows, err := s.queries.DeleteInstanceIntegration(ctx, db.DeleteInstanceIntegrationParams{
		OrganizationID: organizationID,
		InstanceID:     instanceID,
		Adapter:        adapter,
	})
	if err != nil {
		return err
	}
	if rows == 0 {
		return kaitenerrors.NotFound(
			"DeleteInstanceIntegration.NotFound",
			fmt.Sprintf("Integration %q not found for instance %q", adapter, instanceSlug),
		)
	}

	return nil
}

func (s *Store) upsertIntegration(ctx context.Context, organizationID, instanceID uuid.UUID, instanceSlug, adapter, operation string, input UpsertInput) (*schema.InstanceIntegration, error) {
	prepared, err := prepareUpsertInput(operation, adapter, input)
	if err != nil {
		return nil, err
	}

	syncedAt := time.Now().UTC()

	rows, err := s.queries.UpsertInstanceIntegration(ctx, db.UpsertInstanceIntegrationParams{
		OrganizationID: organizationID,
		InstanceID:     instanceID,
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
			operation+".InstanceNotFound",
			fmt.Sprintf("Instance with slug %q not found", instanceSlug),
		)
	}

	return &schema.InstanceIntegration{
		ExternalID: prepared.externalID,
		Metadata:   prepared.metadata,
		WebURL:     prepared.webURL,
		SyncedAt:   syncedAt,
		LastError:  prepared.lastError,
	}, nil
}

func (s *Store) resolveInstanceID(ctx context.Context, organizationID uuid.UUID, instanceSlug, errorCode string) (uuid.UUID, error) {
	row, err := s.queries.GetOneInstance(ctx, db.GetOneInstanceParams{
		OrganizationID: organizationID,
		Slug:           instanceSlug,
	})
	if err != nil {
		if isNoRowsError(err) {
			return uuid.Nil, kaitenerrors.NotFound(
				errorCode,
				fmt.Sprintf("Instance with slug %q not found", instanceSlug),
			)
		}
		return uuid.Nil, err
	}

	return row.ID, nil
}

func rowToIntegration(row db.GetInstanceIntegrationRow) (*schema.InstanceIntegration, error) {
	metadata, err := schema.UnmarshalJSONObject(row.Metadata)
	if err != nil {
		return nil, err
	}

	return &schema.InstanceIntegration{
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

	metadata := schema.NormalizeJSONObject(input.Metadata)

	metadataBytes, err := schema.MarshalJSONObject(metadata)
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
