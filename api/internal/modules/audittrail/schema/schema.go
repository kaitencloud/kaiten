// Package schema holds the audittrail module's own plain data types,
// returned by its public read ports (listforinstance, listfororganization).
// It intentionally carries no HTTP/GraphQL binding tags -- callers outside
// this module (instances' REST endpoint and GraphQL resolver) convert into
// their own public response types, which do carry those tags.
package schema

import (
	"time"

	"github.com/google/uuid"
)

// Actor kinds an entry names.
const (
	ActorUser    = "USER"
	ActorService = "SERVICE"
	ActorSystem  = "SYSTEM"
)

// systemExternalID is system:kaiten's (platformidentity.ExternalID).
const systemExternalID = "system:kaiten"

// Actor is the user an entry was recorded under (§5 Conventions): a person,
// a service account, or Kaiten itself, shown as "Kaiten (system)".
type Actor struct {
	ID   uuid.UUID
	Name string
	Kind string
}

// ActorOf builds an entry's actor from its row; nil when the entry names none
// (written before the actor was recorded, or the user is gone).
func ActorOf(id *uuid.UUID, name *string, userType string, externalID *string) *Actor {
	if id == nil || name == nil {
		return nil
	}
	actor := &Actor{ID: *id, Name: *name, Kind: ActorUser}
	switch {
	case externalID != nil && *externalID == systemExternalID:
		actor.Name, actor.Kind = "Kaiten (system)", ActorSystem
	case userType == "machine":
		actor.Kind = ActorService
	}
	return actor
}

// Entry is one instance-scoped audit trail record.
type Entry struct {
	ID           uuid.UUID
	InstanceID   *uuid.UUID
	InstanceSlug string
	EventName    string
	EventType    string
	OccurredAt   time.Time
	Payload      []byte
	Actor        *Actor
}

// OrganizationEntry is one organization-wide audit trail record. Instance
// and customer fields are only set for instance-scoped events.
type OrganizationEntry struct {
	ID           uuid.UUID
	InstanceID   *uuid.UUID
	InstanceSlug *string
	InstanceName *string
	CustomerID   *uuid.UUID
	CustomerSlug *string
	CustomerName *string
	EventName    string
	EventType    string
	OccurredAt   time.Time
	Payload      []byte
	Actor        *Actor
}
