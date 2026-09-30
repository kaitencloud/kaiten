// Package graphql is the components module's GraphQL read surface: the
// Query.components and Query.component root fields the schema declares, kept
// next to the module rather than in the shared resolver package so the
// generated db.Queries never leaves the module.
package graphql

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

// GetComponents returns a cursor-paginated page of components for the current
// organization -- the GraphQL twin of GET /components.
func GetComponents(ctx context.Context, queries *db.Queries, limit int32, cursor *string) (*schema.ComponentPage, error) {
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
			// message, under the code GET /components already reports.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "Components.InvalidCursor", "invalid cursor")
		}
		cursorCreatedAt = &key.CreatedAt
		cursorID = &key.ID
	}

	rows, err := queries.GetComponents(ctx, db.GetComponentsParams{
		OrganizationID:  i.OrganizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    l + 1,
	})
	if err != nil {
		return nil, err
	}

	components := make([]schema.Component, 0, len(rows))
	for _, row := range rows {
		components = append(components, schema.Component{
			ID:                  row.ID,
			PreviousComponentID: row.PreviousComponentID,
			Name:                row.Name,
			Version:             row.Version,
			Slug:                row.Slug,
			Description:         row.Description,
			CreatedBy:           shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:           row.CreatedAt.Time,
		})
	}

	page, err := pagination.BuildPage(components, l, func(c schema.Component) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: c.CreatedAt, ID: c.ID}
	})
	if err != nil {
		return nil, err
	}

	return &schema.ComponentPage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// GetComponent returns a single component by ID or slug. A component the
// organization does not have resolves to nil, not an error, matching
// Query.release.
func GetComponent(ctx context.Context, queries *db.Queries, id *uuid.UUID, slug *string) (*schema.Component, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	switch {
	case id != nil:
		row, err := queries.GetComponentByID(ctx, db.GetComponentByIDParams{
			OrganizationID: i.OrganizationID,
			ComponentID:    *id,
		})
		if err != nil {
			return nil, ignoreNoRows(err)
		}
		return &schema.Component{
			ID:                  row.ID,
			PreviousComponentID: row.PreviousComponentID,
			Name:                row.Name,
			Version:             row.Version,
			Slug:                row.Slug,
			Description:         row.Description,
			CreatedBy:           shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:           row.CreatedAt.Time,
		}, nil
	case slug != nil:
		row, err := queries.GetComponentBySlug(ctx, db.GetComponentBySlugParams{
			OrganizationID: i.OrganizationID,
			Slug:           *slug,
		})
		if err != nil {
			return nil, ignoreNoRows(err)
		}
		return &schema.Component{
			ID:                  row.ID,
			PreviousComponentID: row.PreviousComponentID,
			Name:                row.Name,
			Version:             row.Version,
			Slug:                row.Slug,
			Description:         row.Description,
			CreatedBy:           shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:           row.CreatedAt.Time,
		}, nil
	default:
		return nil, nil
	}
}

func ignoreNoRows(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}
