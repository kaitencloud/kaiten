// Package listcursor holds the keyset cursor shape shared by the module's two
// list surfaces: GET /metadata-fields (getmetadatafields) and the GraphQL
// metadataFields query (graphql). Both walk the same table in the same order,
// so both mint and accept the same cursor -- a token taken from a REST
// response resumes a GraphQL page and vice versa. Keeping one type here,
// rather than a copy per surface, is what makes that a compile-time fact
// instead of a coincidence two JSON structs happen to share.
package listcursor

import (
	"time"

	"github.com/google/uuid"
)

// Key is the keyset cursor for the metadata-field list order (display_order
// ASC, created_at ASC, id ASC). Metadata fields are a user-reorderable list --
// display_order is the primary, admin-controlled sort key, not a stable total
// order on its own (multiple fields can share a display_order), so created_at
// and then id (always unique) tie-break it. See pagination.CreatedAtCursor's
// doc comment: endpoints that deliberately preserve a different, meaningful
// sort order define their own cursor key type instead of reusing the shared
// CreatedAtCursor/IDCursor shapes.
//
// The JSON field names are the wire format of an opaque cursor token: renaming
// one invalidates every cursor already handed out, so treat them as fixed.
type Key struct {
	DisplayOrder int32     `json:"displayOrder"`
	CreatedAt    time.Time `json:"createdAt"`
	ID           uuid.UUID `json:"id"`
}
