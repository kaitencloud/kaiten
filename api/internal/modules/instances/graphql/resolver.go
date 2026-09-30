package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listforinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listfororganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// intPtrToInt32 converts a GraphQL nullable Int argument (*int) to an int32,
// treating a nil or non-positive value as 0 so callers can uniformly treat
// "0" as "not specified" before applying their own default. A value above
// int32 is clamped rather than wrapped: it arrives from a client query, and
// wrapping would turn an oversized page request into a small or negative one.
func intPtrToInt32(v *int) int32 {
	if v == nil || *v <= 0 {
		return 0
	}
	if *v > math.MaxInt32 {
		return math.MaxInt32
	}
	return int32(*v)
}

// GetInstances returns a cursor-paginated page of instances for the current
// organization, optionally restricted to those linked to an integration
// adapter.
//
// The hasIntegration filter is a predicate of the keyset-paginated queries
// themselves, so a filtered request pages exactly like an unfiltered one:
// same clamped limit, same cursor, same honest HasMore.
func GetInstances(ctx context.Context, queries *db.Queries, hasIntegration *string, limit int32, cursor *string) (*schema.InstancePage, error) {
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
			// message, under the code GET /instances already reports.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "Instances.InvalidCursor", "invalid cursor")
		}
		cursorCreatedAt = &key.CreatedAt
		cursorID = &key.ID
	}

	rows, err := queries.GetAllInstancesByCursor(ctx, db.GetAllInstancesByCursorParams{
		OrganizationID:  i.OrganizationID,
		Adapter:         hasIntegration,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    l + 1,
	})
	if err != nil {
		return nil, err
	}
	result := make([]schema.Instance, 0, len(rows))
	for _, r := range rows {
		inst, err := toInstanceSchemaFromGetAllInstancesByCursorRow(r)
		if err != nil {
			return nil, err
		}
		result = append(result, *inst)
	}
	return buildInstancePage(result, l)
}

func buildInstancePage(instances []schema.Instance, limit int32) (*schema.InstancePage, error) {
	page, err := pagination.BuildPage(instances, limit, func(i schema.Instance) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: i.CreatedAt, ID: i.ID}
	})
	if err != nil {
		return nil, err
	}
	return &schema.InstancePage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// GetInstance returns a single instance by ID or slug.
func GetInstance(ctx context.Context, queries *db.Queries, id *uuid.UUID, slug *string) (*schema.Instance, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	if id != nil {
		instances, err := queries.GetInstancesByIDs(ctx, db.GetInstancesByIDsParams{
			OrganizationID: i.OrganizationID,
			InstanceIds:    []uuid.UUID{*id},
		})
		if err != nil {
			return nil, err
		}
		if len(instances) == 0 {
			return nil, nil
		}
		return toInstanceSchemaFromGetInstancesByIDsRow(instances[0])
	}

	if slug != nil {
		row, err := queries.GetOneInstance(ctx, db.GetOneInstanceParams{
			OrganizationID: i.OrganizationID,
			Slug:           *slug,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		return toInstanceSchemaFromGetOneInstanceRow(row)
	}

	return nil, nil
}

// LoadInstancesByCustomer loads instances by customer ID using the dataloader.
func LoadInstancesByCustomer(ctx context.Context, customerID uuid.UUID) ([]schema.Instance, error) {
	loader, err := GetInstancesByCustomerLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, customerID)
	instances, err := thunk()
	if err != nil {
		return nil, err
	}

	return toInstanceSchemasFromCustomerRows(instances)
}

// decodeAuditTrailCursor decodes a GraphQL cursor argument into the
// (occurred_at, id) pair ListAuditTrails/ListOrganizationAuditTrails
// keyset-filter on, returning (nil, nil, nil) for a first-page request
// (cursor == nil).
//
// A malformed cursor is bad input, not a server fault -- typed so
// presentError keeps the message, under the code GET
// /instances/{instanceSlug}/audit-trails already reports. Both feeds share
// it: the org-wide one has no REST twin of its own, and it walks the same
// (occurred_at, id) keyset over the same rows, so the same bad token is the
// same mistake on either.
func decodeAuditTrailCursor(cursor *string) (occurredAt *time.Time, id *uuid.UUID, err error) {
	if cursor == nil {
		return nil, nil, nil
	}
	key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
	if err != nil {
		return nil, nil, apierrors.Wrap(err, apierrors.KindValidation, "AuditTrails.InvalidCursor", "invalid cursor")
	}
	return &key.CreatedAt, &key.ID, nil
}

// GetAuditTrails returns a cursor-paginated page of audit trail entries for
// a given instance slug.
func GetAuditTrails(ctx context.Context, port *listforinstance.UseCase, instanceSlug string, eventName *string, after, before *time.Time, limit *int, cursor *string) (*schema.AuditTrailPage, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	l := pagination.ClampLimit(intPtrToInt32(limit))

	cursorOccurredAt, cursorID, err := decodeAuditTrailCursor(cursor)
	if err != nil {
		return nil, err
	}

	var pageCursor *pagination.CreatedAtCursor
	if cursorOccurredAt != nil && cursorID != nil {
		pageCursor = &pagination.CreatedAtCursor{CreatedAt: *cursorOccurredAt, ID: *cursorID}
	}

	entries, err := port.Execute(ctx, instanceSlug, i.OrganizationID, eventName, after, before, l+1, pageCursor)
	if err != nil {
		return nil, err
	}

	trails := make([]*schema.AuditTrail, 0, len(entries))
	for _, entry := range entries {
		trail, err := toAuditTrailSchema(entry)
		if err != nil {
			return nil, err
		}
		trails = append(trails, trail)
	}

	page, err := pagination.BuildPage(trails, l, func(t *schema.AuditTrail) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: t.Timestamp, ID: t.ID}
	})
	if err != nil {
		return nil, err
	}

	items := make([]schema.AuditTrail, 0, len(page.Items))
	for _, t := range page.Items {
		items = append(items, *t)
	}
	return &schema.AuditTrailPage{Items: items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// OrganizationAuditTrailDefaultLimit and OrganizationAuditTrailMaxLimit are
// wider than pagination.DefaultLimit/MaxLimit: this is an org-wide feed
// (used by admin-facing dashboards), and predates the shared pagination
// package with its own, deliberately larger bound. Preserved as-is when
// this endpoint moved from offset to cursor pagination.
const (
	OrganizationAuditTrailDefaultLimit int32 = 200
	OrganizationAuditTrailMaxLimit     int32 = 1000
)

// GetOrganizationAuditTrails returns a cursor-paginated page of audit trail
// entries for the whole organization, including events not attached to an
// instance.
func GetOrganizationAuditTrails(ctx context.Context, port *listfororganization.UseCase, eventName *string, after, before *time.Time, limit *int, cursor *string) (*schema.OrganizationAuditTrailPage, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	l := OrganizationAuditTrailDefaultLimit
	if v := intPtrToInt32(limit); v > 0 {
		l = v
		if l > OrganizationAuditTrailMaxLimit {
			l = OrganizationAuditTrailMaxLimit
		}
	}

	cursorOccurredAt, cursorID, err := decodeAuditTrailCursor(cursor)
	if err != nil {
		return nil, err
	}

	var pageCursor *pagination.CreatedAtCursor
	if cursorOccurredAt != nil && cursorID != nil {
		pageCursor = &pagination.CreatedAtCursor{CreatedAt: *cursorOccurredAt, ID: *cursorID}
	}

	entries, err := port.Execute(ctx, i.OrganizationID, eventName, after, before, l+1, pageCursor)
	if err != nil {
		return nil, err
	}

	trails := make([]*schema.OrganizationAuditTrail, 0, len(entries))
	for _, entry := range entries {
		trail, err := toOrganizationAuditTrailSchema(entry)
		if err != nil {
			return nil, err
		}
		trails = append(trails, trail)
	}

	page, err := pagination.BuildPage(trails, l, func(t *schema.OrganizationAuditTrail) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: t.Timestamp, ID: t.ID}
	})
	if err != nil {
		return nil, err
	}

	items := make([]schema.OrganizationAuditTrail, 0, len(page.Items))
	for _, t := range page.Items {
		items = append(items, *t)
	}
	return &schema.OrganizationAuditTrailPage{Items: items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// LoadInstancesByLicense loads instances by license ID using the dataloader.
func LoadInstancesByLicense(ctx context.Context, licenseID uuid.UUID) ([]schema.Instance, error) {
	loader, err := GetInstancesByLicenseLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, licenseID)
	instances, err := thunk()
	if err != nil {
		return nil, err
	}

	return toInstanceSchemasFromLicenseRows(instances)
}

// LoadEntitlementUsage loads the entitlement usage of one instance using the
// dataloader (one row per license grant, zero-defaulted usage).
func LoadEntitlementUsage(ctx context.Context, instanceID uuid.UUID) ([]schema.EntitlementUsage, error) {
	loader, err := GetEntitlementUsageLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, instanceID)
	return thunk()
}

// UsageValueToMap converts a wire EntitlementValue into the GraphQL Map shape,
// round-tripping through JSON so the GraphQL payload stays byte-identical to
// the REST usage endpoint.
func UsageValueToMap(value schema.EntitlementValue) (map[string]any, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	return parsed, nil
}

// LoadInstanceIntegrations loads integrations for one instance using the dataloader.
func LoadInstanceIntegrations(ctx context.Context, instanceID uuid.UUID) (map[string]schema.InstanceIntegration, error) {
	loader, err := GetInstanceIntegrationsLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, instanceID)
	rows, err := thunk()
	if err != nil {
		return nil, err
	}

	return toInstanceIntegrations(rows)
}

func toInstanceIntegrations(rows []db.GetInstanceIntegrationsByInstanceIDsRow) (map[string]schema.InstanceIntegration, error) {
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
