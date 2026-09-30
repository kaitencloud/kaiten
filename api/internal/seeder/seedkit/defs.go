// Package seedkit holds reusable, declarative seeding helpers shared by the
// seeder profiles. Helpers take a *seeder.SeederContext and plain structs and
// drive the real module use cases (so every write still flows through the
// unit-of-work and emits outbox/CDC events). seedkit imports seeder and the
// dogfooding catalog; neither imports seedkit, so there is no cycle.
package seedkit

import (
	"time"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// UserIdentity bundles a domain user with its auth-provider identity.
// Embed shared.User so .ID and .Name are promoted to the outer type.
type UserIdentity struct {
	shared.User // ID + Name
	ExternalID  string
	Email       string
}

// EntitlementGroupDef declares an entitlement group to create.
type EntitlementGroupDef struct {
	Name string
	Slug string
}

// EntitlementDef declares an entitlement to create. AggregationMethod is
// only applied when Type == Number.
type EntitlementDef struct {
	Name              string
	Slug              string
	Description       string
	GroupSlugs        []string
	Type              entitlementschema.Type
	AggregationMethod entitlementschema.AggregationMethod
}

// MetadataFieldDef declares a typed metadata field for a resource type.
type MetadataFieldDef struct {
	Key          string
	Label        string
	ResourceType metadatafieldsdb.MetadataFieldResourceType
	DisplayOrder int32
	JSONSchema   map[string]any
}

// TokenDef declares a token to mint on a service account.
type TokenDef struct {
	Name      string
	Slug      *string
	Scopes    []string
	ExpiresAt *time.Time
}

// ServiceAccountDef declares a service account and the tokens to mint on it.
type ServiceAccountDef struct {
	Name   string
	Slug   *string
	Tokens []TokenDef
}
