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

// Entry is one instance-scoped audit trail record.
type Entry struct {
	ID           uuid.UUID
	InstanceID   *uuid.UUID
	InstanceSlug string
	EventName    string
	EventType    string
	OccurredAt   time.Time
	Payload      []byte
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
}
