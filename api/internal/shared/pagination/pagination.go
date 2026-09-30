// Package pagination provides shared, generic building blocks for
// cursor-based (keyset/seek) pagination across this codebase's list
// endpoints: an opaque cursor codec (see cursor.go), a limit-clamping
// helper, and a generic response envelope.
package pagination

// DefaultLimit and MaxLimit bound the page size a list endpoint accepts
// via its `limit` query parameter. These match the bound
// instances/getaudittrails established (as offset/limit) before this
// package existed, kept as the repo-wide convention now that every list
// endpoint shares it.
const (
	DefaultLimit int32 = 50
	MaxLimit     int32 = 200
)

// ClampLimit normalizes a caller-supplied limit: non-positive (including
// the zero value of an unset query parameter) becomes DefaultLimit, and
// anything above MaxLimit is capped to it. Endpoints should call this
// once, on the raw request value, before passing a limit down to their
// repository.
func ClampLimit(limit int32) int32 {
	if limit <= 0 {
		return DefaultLimit
	}
	if limit > MaxLimit {
		return MaxLimit
	}
	return limit
}

// Page is the generic response envelope every paginated list endpoint
// returns. Items holds at most the requested limit's worth of rows;
// NextCursor is nil exactly when HasMore is false -- there is nothing
// further a caller could page to.
type Page[T any] struct {
	// nullable:"false": Trim/BuildPage always produce a non-nil slice (see
	// Trim), so the OpenAPI contract should promise "always an array,
	// possibly empty" rather than leaving every consumer to defensively
	// handle a null items field that can't actually occur.
	Items      []T     `json:"items" nullable:"false"`
	NextCursor *string `json:"nextCursor,omitempty" doc:"Opaque cursor for the next page. Absent when hasMore is false."`
	HasMore    bool    `json:"hasMore" doc:"Whether more rows exist beyond this page."`
}

// Trim reports the at-most-limit prefix of rows and whether rows held more
// than that. It is the "fetch limit+1, then trim and detect more" half of
// the shared pattern, split out from BuildPage so it is independently
// usable and testable without also needing a cursor-key function.
//
// rows is expected to be the result of a query that asked for limit+1
// rows -- that is how Trim tells "there were exactly `limit` rows total"
// apart from "there were more" without a separate COUNT query. A nil rows
// is treated the same as an empty, non-nil slice, so callers never see a
// nil Items in the returned Page.
func Trim[T any](rows []T, limit int32) (items []T, hasMore bool) {
	if limit < 0 {
		limit = 0
	}
	if rows == nil {
		rows = []T{}
	}
	if int64(len(rows)) > int64(limit) {
		return rows[:limit], true
	}
	return rows, false
}

// BuildPage implements the full common pattern: trim rows (fetched with an
// intentional limit+1 query) down to at most limit items, and -- only when
// there is in fact a further page -- derive and encode the next cursor
// from the last kept row via keyOf, so each handler doesn't have to
// hand-roll this.
//
// keyOf receives the last item being kept on this page and must return
// the same cursor-key shape (e.g. CreatedAtCursor, IDCursor, or an
// endpoint-local type) that the endpoint's repository decodes back out of
// the `cursor` query parameter on a subsequent request.
func BuildPage[T any, K any](rows []T, limit int32, keyOf func(T) K) (Page[T], error) {
	items, hasMore := Trim(rows, limit)
	page := Page[T]{Items: items, HasMore: hasMore}
	if !hasMore || len(items) == 0 {
		return page, nil
	}

	cursor, err := Encode(keyOf(items[len(items)-1]))
	if err != nil {
		return Page[T]{}, err
	}
	page.NextCursor = &cursor
	return page, nil
}
