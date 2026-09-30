package graphql

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// GetEntitlements returns a cursor-paginated page of entitlement
// definitions (groups included) for the current organization.
func GetEntitlements(ctx context.Context, queries *db.Queries, limit int32, cursor *string) (*schema.EntitlementPage, error) {
	identity, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	l := pagination.ClampLimit(limit)

	var (
		cursorCreatedAt pgtype.Timestamp
		cursorID        *uuid.UUID
	)
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			// Bad input, not a server fault -- typed so presentError keeps the
			// message, under the code GET /entitlements already reports.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "Entitlements.InvalidCursor", "invalid cursor")
		}
		cursorCreatedAt = pgtime.TimePtrToPgTimestamp(&key.CreatedAt)
		cursorID = &key.ID
	}

	entitlements, err := queries.GetEntitlementsByCursor(ctx, db.GetEntitlementsByCursorParams{
		OrganizationID:  identity.OrganizationID,
		CursorCreatedAt: cursorCreatedAt,
		CursorID:        cursorID,
		LimitPlusOne:    l + 1,
	})
	if err != nil {
		return nil, err
	}

	groupRows, err := queries.GetEntitlementGroupsForOrganizationEntitlements(ctx, identity.OrganizationID)
	if err != nil {
		return nil, err
	}
	groups := groupsBySlug(groupRows)

	mapped := make([]schema.Entitlement, len(entitlements))
	for i, e := range entitlements {
		mapped[i] = toEntitlementSchema(e, groups[e.Slug])
	}

	page, err := pagination.BuildPage(mapped, l, func(e schema.Entitlement) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: e.CreatedAt, ID: e.ID}
	})
	if err != nil {
		return nil, err
	}

	return &schema.EntitlementPage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// LoadEntitlementBySlug loads one full entitlement definition via the dataloader.
func LoadEntitlementBySlug(ctx context.Context, slug string) (*schema.Entitlement, error) {
	loader, err := GetEntitlementBySlugLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, slug)
	entitlement, err := thunk()
	if err != nil {
		return nil, err
	}
	return &entitlement, nil
}
