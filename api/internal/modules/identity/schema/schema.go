package schema

import (
	"time"

	"github.com/google/uuid"

	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// ServiceAccount is reused unmodified as the request body for both
// create-service-account and update-service-account, as well as the
// response for both and get-service-account. ID/ExternalID/CreatedBy/
// CreatedAt/Tokens are readOnly:"true" (server-assigned/resolved). Slug is
// accepted on create but not settable through update-service-account --
// its handler rejects it being present and different from the current slug
// with a 422.
type ServiceAccount struct {
	ID         uuid.UUID    `json:"id,omitempty" readOnly:"true"`
	Name       string       `json:"name" minLength:"1"`
	Slug       string       `json:"slug,omitempty" doc:"Optional URL-friendly identifier, unique per organization. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	ExternalID string       `json:"externalId,omitempty" readOnly:"true"`
	CreatedBy  *shared.User `json:"createdBy,omitempty" readOnly:"true"`
	CreatedAt  time.Time    `json:"createdAt,omitempty" readOnly:"true"`
	Tokens     []Token      `json:"tokens" readOnly:"true"`
}

// Token is a service account credential's metadata -- never a request body
// on its own (only embedded in PlainToken, which is). Its fields carry
// readOnly:"true" for that context: server-assigned identity and audit
// fields on a resource this API only ever creates through
// create-service-account-token (see PlainToken).
type Token struct {
	ID               uuid.UUID    `json:"id,omitempty" readOnly:"true"`
	Name             string       `json:"name"`
	Slug             string       `json:"slug,omitempty" doc:"Optional URL-friendly identifier, unique per service account. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Scopes           []string     `json:"scopes"`
	ServiceAccountID uuid.UUID    `json:"serviceAccountId,omitempty" readOnly:"true"`
	ExpiresAt        *time.Time   `json:"expiresAt,omitempty"`
	CreatedAt        time.Time    `json:"createdAt" readOnly:"true"`
	CreatedBy        shared.User  `json:"createdBy" readOnly:"true"`
	RevokedAt        *time.Time   `json:"revokedAt,omitempty" readOnly:"true"`
	RevokedBy        *shared.User `json:"revokedBy,omitempty" readOnly:"true"`
}

// PlainToken is reused unmodified as the request body for
// create-service-account-token and as its response (the only place the
// plaintext secret is ever returned). Value is readOnly:"true": the server
// generates the secret, a client never supplies one.
type PlainToken struct {
	Token
	Value string `json:"token,omitempty" readOnly:"true"`
}
