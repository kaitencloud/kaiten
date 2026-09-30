// Package pgtime converts between time.Time and the pgtype timestamp types
// sqlc generates field types as. It has no dependency on any generated
// Queries/models package, so every module -- and any cross-cutting
// infrastructure package -- can import it directly instead of reaching into
// another module's generated code just to convert a timestamp.
package pgtime

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// PgTimeStampToTimePtr converts pgtype.Timestamp to *time.Time.
func PgTimeStampToTimePtr(ts pgtype.Timestamp) *time.Time {
	if !ts.Valid {
		return nil
	}
	return &ts.Time
}

// TimePtrToPgTimestamp converts *time.Time to pgtype.Timestamp.
func TimePtrToPgTimestamp(t *time.Time) pgtype.Timestamp {
	if t == nil {
		return pgtype.Timestamp{Valid: false}
	}
	return pgtype.Timestamp{
		Time:  *t,
		Valid: true,
	}
}

// PgTimestamptzToTime converts pgtype.Timestamptz to time.Time.
func PgTimestamptzToTime(ts pgtype.Timestamptz) time.Time {
	if !ts.Valid {
		return time.Time{}
	}
	return ts.Time
}

// TimePtrToPgTimestamptz converts *time.Time to pgtype.Timestamptz.
func TimePtrToPgTimestamptz(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{Valid: false}
	}
	return pgtype.Timestamptz{
		Time:  *t,
		Valid: true,
	}
}
