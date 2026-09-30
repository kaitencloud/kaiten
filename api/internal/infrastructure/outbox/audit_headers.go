package outbox

import "github.com/google/uuid"

// AuditHeaders is the optional headers payload for outbox events that carry
// instance-scoped metadata. The audit trail subscriber reads InstanceID when
// writing to the audit_trail table. Event-specific outcomes such as
// ACCEPTED/REJECTED belong in the event payload, not here.
type AuditHeaders struct {
	InstanceID *uuid.UUID `json:"instance_id,omitempty"`
}
