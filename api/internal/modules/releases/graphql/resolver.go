package graphql

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// GetReleases returns a cursor-paginated page of releases for the current
// organization.
func GetReleases(ctx context.Context, queries *db.Queries, limit int32, cursor *string) (*schema.ReleasePage, error) {
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
			// message, under the code GET /releases already reports.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "Releases.InvalidCursor", "invalid cursor")
		}
		cursorCreatedAt = &key.CreatedAt
		cursorID = &key.ID
	}

	releases, err := queries.GetReleases(ctx, db.GetReleasesParams{
		OrganizationID:  i.OrganizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    l + 1,
	})
	if err != nil {
		return nil, err
	}

	page, err := pagination.BuildPage(toReleaseSchemasFromGetReleasesRows(releases), l, func(r schema.Release) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: r.CreatedAt, ID: r.ID}
	})
	if err != nil {
		return nil, err
	}

	return &schema.ReleasePage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// GetRelease returns a single release by ID or slug.
func GetRelease(ctx context.Context, queries *db.Queries, id *uuid.UUID, slug *string) (*schema.Release, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	if id != nil {
		row, err := queries.GetOneRelease(ctx, db.GetOneReleaseParams{
			OrganizationID: i.OrganizationID,
			ReleaseID:      *id,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		result := schema.Release{
			ID:          row.ID,
			Version:     row.Version,
			Slug:        row.Slug,
			Description: row.Description,
			CreatedAt:   row.CreatedAt.Time,
		}
		result.CreatedBy.ID = row.CreatedByID
		result.CreatedBy.Name = row.CreatedByName
		return &result, nil
	}

	if slug != nil {
		row, err := queries.GetOneReleaseBySlug(ctx, db.GetOneReleaseBySlugParams{
			OrganizationID: i.OrganizationID,
			Slug:           *slug,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		result := toReleaseSchemaFromGetOneReleaseBySlug(row)
		return &result, nil
	}

	return nil, nil
}
