package pagination

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ErrInvalidCursor is returned by Decode when a cursor string fails to
// decode into the requested type T -- either because it isn't validly
// base64/JSON encoded at all, or because a client (or a stale bookmarked
// link) is passing a cursor shaped for a different endpoint. It always
// means bad input, never a server-side fault, so callers should wrap it
// with apierrors.Wrap(err, apierrors.KindValidation, ...) to surface a 400
// rather than letting it fall through to a 500.
var ErrInvalidCursor = errors.New("pagination: invalid cursor")

// Encode opaquely serializes key as a cursor token: JSON-encode, then
// base64 (URL-safe, unpadded, so the token is safe to embed directly in a
// query string with no further escaping). Callers should treat the
// resulting string as opaque -- its shape is not a public contract and may
// change.
func Encode[T any](key T) (string, error) {
	raw, err := json.Marshal(key)
	if err != nil {
		return "", fmt.Errorf("pagination: encode cursor: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// Decode reverses Encode, decoding token back into a T. It returns
// ErrInvalidCursor (wrapping the underlying decode error) if token is not
// valid base64 or does not unmarshal into T. On error, the returned T is
// not meaningful (it may be the zero value, or partially populated if
// some fields decoded before a later one failed) and must not be used --
// callers should check the error first.
func Decode[T any](token string) (T, error) {
	var key T

	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return key, fmt.Errorf("%w: %s", ErrInvalidCursor, err)
	}
	if err := json.Unmarshal(raw, &key); err != nil {
		return key, fmt.Errorf("%w: %s", ErrInvalidCursor, err)
	}
	return key, nil
}

// CreatedAtCursor is the keyset cursor shape for the common case in this
// codebase: a table with a created_at column, ordered by created_at then
// tie-broken by id (created_at alone is not guaranteed unique -- two rows
// can share a millisecond-precision timestamp). Most list endpoints use
// this shape directly; endpoints whose table has no created_at column, or
// that deliberately preserve a different, meaningful sort order, define
// their own cursor key type instead (see IDCursor, and each such
// endpoint's own repository.go).
type CreatedAtCursor struct {
	CreatedAt time.Time `json:"createdAt"`
	ID        uuid.UUID `json:"id"`
}

// IDCursor is the keyset cursor shape for tables with no created_at (or
// equivalent monotonic timestamp) column, ordering by id alone. Every id
// in this codebase is a Postgres gen_random_uuid() (UUID v4, randomly
// generated, not v7/ULID), so this is a stable total order -- every row is
// still seen exactly once across pages -- but not a chronological one:
// page order does not reflect insertion order.
type IDCursor struct {
	ID uuid.UUID `json:"id"`
}
