// Package graphql exposes the metadatafields module to GraphQL consumers.
//
// The surface is intentionally read-only: only a `metadataFields` query is
// exported. The four mutations (create / update / archive / reorder) stay on
// the REST API — consistent with the rest of the Kaiten
// codebase where GraphQL is the read-side aggregator and Huma/REST owns the
// write path.
package graphql

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/listcursor"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

// ListMetadataFields returns a cursor-paginated page of MetadataField rows for
// the current org and the given resource type -- the GraphQL twin of GET
// /metadata-fields. When includeArchived is true, soft-deleted rows are
// included (useful for the admin UI that surfaces legacy values stored on
// resources).
func ListMetadataFields(
	ctx context.Context,
	queries *db.Queries,
	resourceType db.MetadataFieldResourceType,
	includeArchived bool,
	limit int32,
	cursor *string,
) (*schema.MetadataFieldPage, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	l := pagination.ClampLimit(limit)

	var cursorDisplayOrder *int32
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		key, err := pagination.Decode[listcursor.Key](*cursor)
		if err != nil {
			// A malformed cursor is bad input, not a server fault: type it so
			// presentError keeps the message instead of withholding it behind
			// a correlation id, and reuse the REST endpoint's code so the same
			// mistake reports identically on both surfaces.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "MetadataFields.InvalidCursor", "invalid cursor")
		}
		cursorDisplayOrder = &key.DisplayOrder
		cursorCreatedAt = &key.CreatedAt
		cursorID = &key.ID
	}

	rows, err := queries.ListMetadataFieldsForGraphQL(ctx, db.ListMetadataFieldsForGraphQLParams{
		OrganizationID:     i.OrganizationID,
		ResourceType:       resourceType,
		IncludeArchived:    includeArchived,
		CursorDisplayOrder: cursorDisplayOrder,
		CursorCreatedAt:    pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:           cursorID,
		LimitPlusOne:       l + 1,
	})
	if err != nil {
		return nil, fmt.Errorf("graphql: listing metadata fields: %w", err)
	}

	fields := make([]schema.MetadataField, 0, len(rows))
	for _, r := range rows {
		dto, err := toSchema(r)
		if err != nil {
			return nil, err
		}
		fields = append(fields, dto)
	}

	page, err := pagination.BuildPage(fields, l, func(f schema.MetadataField) listcursor.Key {
		return listcursor.Key{DisplayOrder: f.DisplayOrder, CreatedAt: f.CreatedAt, ID: f.ID}
	})
	if err != nil {
		return nil, err
	}

	return &schema.MetadataFieldPage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

func toSchema(r db.ListMetadataFieldsForGraphQLRow) (schema.MetadataField, error) {
	// Reuse the existing dbmap converter by wrapping the row into a
	// db.MetadataField — keeps the JSONSchema unmarshalling logic in one
	// place, then layers the joined user names on top.
	base, err := dbmap.ToMetadataField(db.MetadataField{
		ID:             r.ID,
		OrganizationID: r.OrganizationID,
		ResourceType:   r.ResourceType,
		Key:            r.Key,
		Label:          r.Label,
		JsonSchema:     r.JsonSchema,
		DisplayOrder:   r.DisplayOrder,
		ArchivedAt:     r.ArchivedAt,
		CreatedAt:      r.CreatedAt,
		CreatedByID:    r.CreatedByID,
		UpdatedAt:      r.UpdatedAt,
		UpdatedByID:    r.UpdatedByID,
	})
	if err != nil {
		return schema.MetadataField{}, err
	}
	base.CreatedBy = shared.User{ID: r.CreatedByID, Name: r.CreatedByName}
	base.UpdatedBy = shared.User{ID: r.UpdatedByID, Name: r.UpdatedByName}
	return *base, nil
}
