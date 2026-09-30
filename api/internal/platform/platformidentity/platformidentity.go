// Package platformidentity holds the facts about system:kaiten -- the one
// identity that is the platform itself rather than a tenant's.
package platformidentity

import "github.com/google/uuid"

// ExternalID is the identifier of record. Every query that resolves this identity
// resolves it by external id, never by the UUID below: a database where the row
// somehow exists under a different id must converge on the identity rather than
// fork a second one.
const ExternalID = "system:kaiten"

// Email and Name make the identity legible wherever it appears -- a membership
// list, an audit payload -- instead of showing up as an anonymous machine row.
// The email is also reserved by "user".email's unique index, so a human
// provisioning with it gets a collision error rather than colliding with the
// platform.
const (
	Email = "system@kaiten.sh"
	Name  = "Kaiten"
)

// Slug contains a colon, and that is load-bearing rather than cosmetic: service
// account slugs are validated against ^[a-z0-9][a-z0-9-]*[a-z0-9]$, which forbids
// one. No tenant can create a service account whose slug collides with this --
// the collision is impossible, not merely unlikely.
const Slug = "system:kaiten"

// ID is the row's UUID, pinned by the migration. Needed in Go only where a UUID
// is structurally required (the token_platform_is_orgless_system CHECK names the
// same literal, because "the owner is system:kaiten" cannot be a subquery in a
// CHECK). Prefer ExternalID everywhere a query can join.
var ID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
