package registry

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
)

var ErrNotFound = errors.New("connector not found")

type Connector struct {
	Name           string
	Version        string
	SettingsSchema map[string]any
	// EntitlementSlug names the BOOLEAN entitlement a license must grant before an
	// organization may activate this connector. Nil means ungated -- see the column
	// comment in 20260821010000_connector_activation.sql for why that is the default
	// rather than an omission.
	EntitlementSlug *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type UpsertInput struct {
	Name            string
	Version         string
	SettingsSchema  map[string]any
	EntitlementSlug *string
}

type Reader interface {
	Get(ctx context.Context, name string) (*Connector, error)
}

// Lister is separate from Reader because a caller that resolves one connector
// by name never needs the catalogue, and the settings use cases that take a
// Reader would otherwise all have to grow a List they do not call.
type Lister interface {
	List(ctx context.Context) ([]Connector, error)
}

type Writer interface {
	Upsert(ctx context.Context, input UpsertInput) (*Connector, error)
}

type Repository interface {
	Reader
	Writer
}

type QueryRepository struct {
	queries *db.Queries
}

func NewQueryRepository(queries *db.Queries) *QueryRepository {
	return &QueryRepository{queries: queries}
}

func (r *QueryRepository) Get(ctx context.Context, name string) (*Connector, error) {
	if r.queries == nil {
		return nil, fmt.Errorf("connector repository is not configured")
	}

	row, err := r.queries.GetConnectorByName(ctx, name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return decodeConnector(row)
}

// List returns every registered connector, ordered by name. The registry is
// platform-wide and small -- one row per connector build, not per
// organization -- so there is no cursor to page through.
func (r *QueryRepository) List(ctx context.Context) ([]Connector, error) {
	if r.queries == nil {
		return nil, fmt.Errorf("connector repository is not configured")
	}

	rows, err := r.queries.ListConnectors(ctx)
	if err != nil {
		return nil, err
	}

	connectors := make([]Connector, 0, len(rows))
	for _, row := range rows {
		connector, err := decodeConnector(row)
		if err != nil {
			return nil, err
		}
		connectors = append(connectors, *connector)
	}

	return connectors, nil
}

func (r *QueryRepository) Upsert(ctx context.Context, input UpsertInput) (*Connector, error) {
	if r.queries == nil {
		return nil, fmt.Errorf("connector repository is not configured")
	}

	schemaBytes, err := json.Marshal(input.SettingsSchema)
	if err != nil {
		return nil, fmt.Errorf("marshal settings schema: %w", err)
	}

	row, err := r.queries.UpsertConnector(ctx, db.UpsertConnectorParams{
		Name:            input.Name,
		Version:         input.Version,
		SettingsSchema:  schemaBytes,
		EntitlementSlug: input.EntitlementSlug,
	})
	if err != nil {
		return nil, err
	}

	return decodeConnector(row)
}

func decodeConnector(row db.Connector) (*Connector, error) {
	settingsSchema := make(map[string]any)
	if err := json.Unmarshal(row.SettingsSchema, &settingsSchema); err != nil {
		return nil, fmt.Errorf("decode settings schema for connector %q: %w", row.Name, err)
	}

	return &Connector{
		Name:            row.Name,
		Version:         row.Version,
		SettingsSchema:  settingsSchema,
		EntitlementSlug: row.EntitlementSlug,
		CreatedAt:       row.CreatedAt.Time,
		UpdatedAt:       row.UpdatedAt.Time,
	}, nil
}
