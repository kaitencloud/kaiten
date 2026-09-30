package schema

import (
	"time"

	"github.com/google/uuid"
)

// PlatformCredential is what GET /api/platform/me answers: which credential the
// caller is holding.
//
// Deliberately not schema.Token, even though both describe a row of the same
// table. Token carries ServiceAccountID, CreatedBy and RevokedBy -- an
// organization-shaped view, resolved through membership -- and it has a
// PlainToken variant that carries a secret. This type has neither, and it never
// grows one: the plaintext existed once, at creation, and no read path can
// return it.
type PlatformCredential struct {
	ID   uuid.UUID `json:"id" readOnly:"true"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
	// Subject is the platform identity this credential authenticates. It is
	// always system:kaiten -- there is no second platform identity -- and it is
	// reported anyway, because a client that trusts the field rather than the
	// constant keeps working if that ever stops being true.
	Subject string `json:"subject" doc:"External id of the platform identity this credential authenticates" example:"system:kaiten"`
	// CredentialKind lets a caller confirm which class of credential it holds
	// without inferring it from the token's prefix.
	CredentialKind string     `json:"credentialKind" doc:"Credential class of the calling token" example:"platform"`
	Scopes         []string   `json:"scopes"`
	ExpiresAt      *time.Time `json:"expiresAt,omitempty" doc:"Absent when the credential does not expire"`
	CreatedAt      time.Time  `json:"createdAt" readOnly:"true"`
}

// SystemTokenIssuance is the SYSTEM_ORGANIZATION_TOKEN_ISSUED payload: the
// platform minted a credential for itself inside this organization, and this says
// what was minted, with which platform credential, and how far it reaches.
//
// It is a separate type from the minted credential itself (schema.PlainToken) for
// one reason that admits no exception: PlainToken carries Value, the plaintext. A
// webhook payload is delivered to a subscriber's HTTP endpoint and stored in an
// outbox row on the way, so reusing it would put a live credential into two
// places the plan forbids -- durable storage and an outbound request. Nothing
// here can ever hold a secret, and the shape is what enforces that rather than a
// reviewer noticing.
//
// The fields answer the question the Core audit path could never answer: which
// platform credential acted. Revoking that credential is what invalidates
// everything in this list, so PlatformTokenId is the actionable field, not
// decoration.
//
// There is no actor field. A platform credential authenticates the platform
// itself -- system:kaiten is the only identity `kind='platform'` can carry, and
// the database says so rather than the convention (token_platform_is_orgless_system
// checks service_account_id against it). Publishing it as a per-event value would
// invite a subscriber to branch on something that has exactly one value, and
// would suggest the platform can act as somebody else. The identity is in
// CredentialKind: "platform" means system:kaiten. Who *asked* for the mint is a
// different question, and one this event genuinely cannot answer -- an operator
// holding a platform credential leaves no user record on this surface, which is
// why AuditPlatformAction logs the credential id.
type SystemTokenIssuance struct {
	// CredentialKind states which class of credential performed the mint, so a
	// subscriber can tell a platform-issued credential from a tenant-issued one
	// without inferring it from the absence of a user.
	CredentialKind string `json:"credentialKind" doc:"Credential class that performed the mint; \"platform\" is the system:kaiten identity" example:"platform"`
	// PlatformTokenId identifies the platform credential itself. Revoking it
	// cascade-revokes every credential it minted, which is what makes this the
	// field an operator acts on.
	PlatformTokenID uuid.UUID `json:"platformTokenId" doc:"Platform credential that performed the mint; revoking it revokes everything it issued"`
	// IssuedTokenId is the minted credential's row. Enough to revoke exactly this
	// one; not enough to use it.
	IssuedTokenID uuid.UUID `json:"issuedTokenId" doc:"The credential that was minted"`
	Name          string    `json:"name" doc:"Human-readable label the caller gave the minted credential" example:"ci-deploy"`
	Slug          string    `json:"slug" doc:"Server-assigned identifier of the minted credential" example:"system-kaiten-9f2c1a"`
	// Scopes is what was actually granted, which is a subset of what the platform
	// credential held -- scopes narrow and never widen.
	Scopes []string `json:"scopes" doc:"Scopes granted to the minted credential" example:"read:customers"`
	// ExpiresAt is absent for a non-expiring credential, whose bound is
	// revocation rather than time.
	ExpiresAt *time.Time `json:"expiresAt,omitempty" doc:"Absent when the minted credential does not expire"`
	IssuedAt  time.Time  `json:"issuedAt" doc:"When the credential was minted"`
}
