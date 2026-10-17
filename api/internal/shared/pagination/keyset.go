package pagination

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Keyset is a page request over a list ordered by (instant DESC, id DESC),
// as a query takes it: sqlc.narg(cursor_at), sqlc.narg(cursor_id) and
// sqlc.narg(row_limit).
type Keyset struct {
	// CursorAt and CursorID are the last row of the previous page; NULL on
	// the first one.
	CursorAt pgtype.Timestamp
	CursorID *uuid.UUID
	// Limit is the page size, clamped.
	Limit int32
	// RowLimit is Limit + 1, so the page knows whether another follows.
	RowLimit *int32
}

// ParseKeyset reads a list's cursor and limit. A cursor that does not decode
// answers 400 <resource>.InvalidCursor (§13.1).
func ParseKeyset(cursor string, limit int32, resource string) (Keyset, error) {
	limit = ClampLimit(limit)
	rowLimit := limit + 1
	out := Keyset{CursorAt: pgtype.Timestamp{}, CursorID: nil, Limit: limit, RowLimit: &rowLimit}
	if cursor == "" {
		return out, nil
	}
	key, err := Decode[CreatedAtCursor](cursor)
	if err != nil {
		return Keyset{}, apierrors.Wrap(err, apierrors.KindValidation, resource+".InvalidCursor", "invalid cursor")
	}
	out.CursorAt = pgtype.Timestamp{Time: key.CreatedAt.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
	out.CursorID = &key.ID
	return out, nil
}

// KeysetPage builds the page of rows read under k, each keyed by its
// instant and id.
func KeysetPage[T any](rows []T, k Keyset, keyOf func(T) (time.Time, uuid.UUID)) (Page[T], error) {
	return BuildPage(rows, k.Limit, func(row T) CreatedAtCursor {
		at, id := keyOf(row)
		return CreatedAtCursor{CreatedAt: at, ID: id}
	})
}
