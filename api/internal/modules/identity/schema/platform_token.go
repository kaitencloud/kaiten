package schema

import (
	"time"

	"github.com/google/uuid"
)

// PlatformToken is a platform credential as its issuer sees it: the row that was
// written, or one row of the inventory of every platform credential this
// deployment has ever had.
//
// Deliberately not PlatformCredential, which describes the same table. That type
// answers GET /api/platform/me -- it is a published component of
// app/platform-openapi.yaml, it describes the credential the caller is *holding*,
// and it carries Subject and CredentialKind because a client reading it needs to
// know what it authenticates. This type answers a different question, asked by the
// only process allowed to issue one, and so carries what an issuer acts on:
// RevokedAt, which no read path on the wire has any business reporting, because
// publishing when a credential stopped working would publish that it existed.
//
// Carrying no struct tags is the same statement the packages behind
// kaiten.InProcess make with their missing endpoint.go: nothing serializes this,
// and it appears in no OpenAPI document. A json tag on it would be the first step
// toward a second, contradictable spelling of the platform credential contract --
// and toward this type reaching a wire that must never learn a credential exists.
type PlatformToken struct {
	ID   uuid.UUID
	Name string
	// Slug is the server-generated internal identifier. Platform credentials are
	// addressed by name, not slug, everywhere an operator names one -- the slug is
	// reported because it is on the row, not because anything looks a credential up
	// by it.
	Slug      string
	Scopes    []string
	CreatedAt time.Time
	// ExpiresAt is nil for a non-expiring credential, whose bound is revocation
	// rather than time.
	ExpiresAt *time.Time
	// RevokedAt is nil for a credential that is still active. A revoked row is kept
	// deliberately -- it is the audit evidence that a credential existed and when it
	// stopped working -- until the retention sweep removes it.
	RevokedAt *time.Time
}

// PlainPlatformToken is a freshly issued platform credential, carrying the one
// thing no read path can ever return.
//
// Mirrors PlainToken over Token, and for the same reason: the plaintext exists at
// exactly one moment, so it is a field on a type that exists at exactly one moment
// rather than an always-empty field on the type every read produces.
type PlainPlatformToken struct {
	PlatformToken
	// Value is the credential itself. Only its hash is stored, so this is the only
	// moment it exists: never logged, never in an error message, never persisted.
	Value string
}
