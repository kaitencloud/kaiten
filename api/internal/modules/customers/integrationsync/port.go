// Package integrationsync is the customers module's public port for the
// generic integrations module's external-ID-driven sync flow: looking a
// customer up by (adapter, external ID) rather than by slug, upserting its
// integration record, and renaming its slug. This is a different access
// pattern than customers/integrations.Store (which is keyed by customer
// slug for the customers module's own REST endpoints), so it lives
// separately -- consumed by internal/modules/integrations instead of that
// module reaching into this one's generated db package directly.
package integrationsync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/integrationurl"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Integration struct {
	ExternalID string
	Metadata   map[string]any
	WebURL     *string
	SyncedAt   time.Time
	LastError  *string
}

type Customer struct {
	ID                 uuid.UUID
	Name               string
	Slug               string
	ExternalCustomerID *string
	Domain             *string
	Integration        Integration
}

type Port interface {
	GetByExternalID(ctx context.Context, organizationID uuid.UUID, adapter, externalID string) (*Customer, error)
	UpsertIntegration(ctx context.Context, organizationID, customerID uuid.UUID, adapter, externalID string, metadata map[string]any, webURL, lastError *string) (*Integration, error)
	UpdateSlugByID(ctx context.Context, organizationID, userID, customerID uuid.UUID, slug string) error
}

type port struct {
	queries *db.Queries
}

// New binds to dbtx -- typically the caller's own uow.UnitOfWork.DBTX(ctx)
// from inside a Transact call, so these calls join the caller's
// transaction (see uow.UnitOfWork.Transact's doc comment).
func New(dbtx uow.DBTX) Port {
	return &port{queries: db.New(dbtx)}
}

// scopedPort is a Port bound to a *uow.UnitOfWork instead of a fixed DBTX.
// Build it once (e.g. in NewUseCase) and call its methods directly, inside
// or outside a Transact closure: each call resolves the DBTX active for
// ctx, so it joins whatever transaction Transact opened for that ctx, with
// no New(...) at the call site.
type scopedPort struct {
	uof *uow.UnitOfWork
}

// NewScoped builds a Port bound to uof. This is the constructor callers
// should use in NewUseCase instead of rebuilding a Port from
// New(uof.DBTX(ctx)) inside every Transact closure.
func NewScoped(uof *uow.UnitOfWork) Port {
	return &scopedPort{uof: uof}
}

// port resolves the Port bound to whatever DBTX is active for ctx.
func (p *scopedPort) port(ctx context.Context) Port {
	return New(p.uof.DBTX(ctx))
}

func (p *scopedPort) GetByExternalID(ctx context.Context, organizationID uuid.UUID, adapter, externalID string) (*Customer, error) {
	return p.port(ctx).GetByExternalID(ctx, organizationID, adapter, externalID)
}

func (p *scopedPort) UpsertIntegration(ctx context.Context, organizationID, customerID uuid.UUID, adapter, externalID string, metadata map[string]any, webURL, lastError *string) (*Integration, error) {
	return p.port(ctx).UpsertIntegration(ctx, organizationID, customerID, adapter, externalID, metadata, webURL, lastError)
}

func (p *scopedPort) UpdateSlugByID(ctx context.Context, organizationID, userID, customerID uuid.UUID, slug string) error {
	return p.port(ctx).UpdateSlugByID(ctx, organizationID, userID, customerID, slug)
}

func (p *port) GetByExternalID(ctx context.Context, organizationID uuid.UUID, adapter, externalID string) (*Customer, error) {
	row, err := p.queries.GetCustomerByIntegrationExternalID(ctx, db.GetCustomerByIntegrationExternalIDParams{
		OrganizationID: organizationID,
		Adapter:        adapter,
		ExternalID:     externalID,
	})
	if err != nil {
		if isNoRows(err) {
			return nil, kaitenerrors.NotFound("Integration.CustomerNotFound", fmt.Sprintf("Customer integration %q/%q not found", adapter, externalID))
		}
		return nil, err
	}

	return &Customer{
		ID:                 row.ID,
		Name:               row.Name,
		Slug:               row.Slug,
		ExternalCustomerID: row.ExternalCustomerID,
		Domain:             row.Domain,
		Integration: Integration{
			ExternalID: row.IntegrationExternalID,
			Metadata:   unmarshalJSONObject(row.IntegrationMetadata),
			WebURL:     row.IntegrationWebUrl,
			SyncedAt:   pgtime.PgTimestamptzToTime(row.IntegrationSyncedAt),
			LastError:  row.IntegrationLastError,
		},
	}, nil
}

func (p *port) UpsertIntegration(ctx context.Context, organizationID, customerID uuid.UUID, adapter, externalID string, metadata map[string]any, webURL, lastError *string) (*Integration, error) {
	normalizedWebURL, err := integrationurl.Normalize(webURL)
	if err != nil {
		return nil, kaitenerrors.Validation("Integration.InvalidWebURL", "Integration web_url must be an absolute http(s) URL")
	}

	syncedAt := time.Now().UTC()
	rows, err := p.queries.UpsertCustomerIntegration(ctx, db.UpsertCustomerIntegrationParams{
		OrganizationID: organizationID,
		CustomerID:     customerID,
		Adapter:        adapter,
		ExternalID:     strings.TrimSpace(externalID),
		Metadata:       marshalJSONObject(metadata),
		WebUrl:         normalizedWebURL,
		SyncedAt:       pgtime.TimePtrToPgTimestamptz(&syncedAt),
		LastError:      normalizeOptionalString(lastError),
	})
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict("Integration.CustomerExternalIDConflict", fmt.Sprintf("Integration external ID %q is already used for adapter %q", externalID, adapter))
		}
		return nil, err
	}
	if rows == 0 {
		return nil, kaitenerrors.NotFound("Integration.CustomerNotFound", fmt.Sprintf("Customer with ID %s not found", customerID))
	}

	return &Integration{
		ExternalID: strings.TrimSpace(externalID),
		Metadata:   normalizeJSONObject(metadata),
		WebURL:     normalizedWebURL,
		SyncedAt:   syncedAt,
		LastError:  normalizeOptionalString(lastError),
	}, nil
}

func (p *port) UpdateSlugByID(ctx context.Context, organizationID, userID, customerID uuid.UUID, slug string) error {
	rows, err := p.queries.UpdateCustomerSlugByID(ctx, db.UpdateCustomerSlugByIDParams{
		Slug:           slug,
		UserID:         userID,
		OrganizationID: organizationID,
		CustomerID:     customerID,
	})
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			return kaitenerrors.Conflict("Integration.CustomerSlugConflict", fmt.Sprintf("Customer with slug %q already exists in this organization", slug))
		}
		return err
	}
	if rows == 0 {
		return kaitenerrors.NotFound("Integration.CustomerNotFound", fmt.Sprintf("Customer with ID %s not found", customerID))
	}
	return nil
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

func normalizeJSONObject(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return value
}

func marshalJSONObject(value map[string]any) []byte {
	b, err := json.Marshal(normalizeJSONObject(value))
	if err != nil {
		return []byte("{}")
	}
	return b
}

func unmarshalJSONObject(raw []byte) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return map[string]any{}
	}
	return m
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
