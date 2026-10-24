// Package exceptions is what the entitlement exception use cases share: the
// shape of their events and its webhook contracts (V32-03 a, §13.16).
//
// An exception is the vendor's explicit, dated decision about one
// entitlement of one instance, given without a code: the last layer of the
// effective view. It is an entitlement feature, not a billing one, so its
// events are emitted whether or not billing is enabled.
package exceptions

import (
	"bytes"
	"encoding/json"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
)

// Kinds of an exception: SET works on every entitlement type, ADD and
// UNLIMITED on NUMBER and NUMBER_AI_CREDIT only.
const (
	KindSet       = "SET"
	KindAdd       = "ADD"
	KindUnlimited = "UNLIMITED"
)

// ExceptionEvent is the payload of the exception events (§15.1).
type ExceptionEvent struct {
	ID              uuid.UUID `json:"id"`
	InstanceSlug    string    `json:"instanceSlug"`
	EntitlementSlug string    `json:"entitlementSlug"`
	Kind            string    `json:"kind" enum:"SET,ADD,UNLIMITED"`
	// Value is the raw value, never the {type, value} wrapper.
	Value     Value      `json:"value"`
	StartsAt  time.Time  `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt" nullable:"true" doc:"Null: no end"`
	Reason    string     `json:"reason"`
	RevokedAt *time.Time `json:"revokedAt" nullable:"true"`
}

// RegisterWebhooks declares the exception events' webhook contracts.
func RegisterWebhooks(api huma.API) {
	tags := []string{"webhooks", "entitlement-exceptions"}
	webhook.Declare(api,
		webhook.Declaration{
			Event: events.InstanceEntitlementExceptionCreated, Data: (*ExceptionEvent)(nil), OperationID: "onInstanceEntitlementExceptionCreated",
			Summary:     "Instance Entitlement Exception Created Webhook",
			Description: "Triggered when an exception is created on one entitlement of an instance. Emitted whether or not billing is enabled.",
			Tags:        tags,
		},
		webhook.Declaration{
			Event: events.InstanceEntitlementExceptionRevoked, Data: (*ExceptionEvent)(nil), OperationID: "onInstanceEntitlementExceptionRevoked",
			Summary:     "Instance Entitlement Exception Revoked Webhook",
			Description: "Triggered when an exception is revoked. Revoking one already revoked or ended emits nothing.",
			Tags:        tags,
		},
		webhook.Declaration{
			Event: events.InstanceEntitlementExceptionExpired, Data: (*ExceptionEvent)(nil), OperationID: "onInstanceEntitlementExceptionExpired",
			Summary:     "Instance Entitlement Exception Expired Webhook",
			Description: "Triggered once per exception, when its endsAt passes; never for a revoked one.",
			Tags:        tags,
		},
	)
}

// Statuses of an exception, computed at read time (§13.15).
const (
	StatusScheduled = "SCHEDULED"
	StatusActive    = "ACTIVE"
	StatusExpired   = "EXPIRED"
	StatusRevoked   = "REVOKED"
)

// Value is an exception's raw value as the API carries it: a JSON number for
// NUMBER and NUMBER_AI_CREDIT, a boolean for BOOLEAN, the CONFIG object; null
// for UNLIMITED. The bytes are kept as sent, so a number is never rounded.
type Value json.RawMessage

// UnmarshalJSON keeps the raw value; null is no value.
func (v *Value) UnmarshalJSON(raw []byte) error {
	if string(bytes.TrimSpace(raw)) == "null" {
		*v = nil
		return nil
	}
	*v = append((*v)[:0], raw...)
	return nil
}

// MarshalJSON writes the raw value, null when there is none.
func (v Value) MarshalJSON() ([]byte, error) {
	if len(v) == 0 {
		return []byte("null"), nil
	}
	return v, nil
}

// Schema is a number, a boolean, an object or null. anyOf, not oneOf: Huma
// checks nothing against a null member, so the request passes through and the
// use case matches the JSON type to the entitlement's (422 .InvalidValue).
func (Value) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Description: "A number for NUMBER and NUMBER_AI_CREDIT, a boolean for BOOLEAN, the CONFIG document as an object; null for UNLIMITED",
		AnyOf: []*huma.Schema{
			{Type: huma.TypeNumber}, {Type: huma.TypeBoolean}, {Type: huma.TypeObject, AdditionalProperties: true}, {Type: "null"},
		},
	}
}

// EntitlementException is an exception as the API returns it (§13.15).
type EntitlementException struct {
	ID              uuid.UUID  `json:"id"`
	InstanceSlug    string     `json:"instanceSlug"`
	EntitlementSlug string     `json:"entitlementSlug"`
	EntitlementType string     `json:"entitlementType" enum:"NUMBER,NUMBER_AI_CREDIT,BOOLEAN,CONFIG"`
	Kind            string     `json:"kind" enum:"SET,ADD,UNLIMITED"`
	Value           Value      `json:"value"`
	StartsAt        time.Time  `json:"startsAt"`
	EndsAt          *time.Time `json:"endsAt" nullable:"true" doc:"Null: no end"`
	Reason          string     `json:"reason"`
	Status          string     `json:"status" enum:"SCHEDULED,ACTIVE,EXPIRED,REVOKED" doc:"At the read: SCHEDULED before startsAt, ACTIVE in its window, EXPIRED after endsAt, REVOKED once revoked"`
	CreatedAt       time.Time  `json:"createdAt"`
	RevokedAt       *time.Time `json:"revokedAt" nullable:"true"`
}

// StatusAt is an exception's status at now.
func StatusAt(startsAt time.Time, endsAt, revokedAt *time.Time, now time.Time) string {
	switch {
	case revokedAt != nil:
		return StatusRevoked
	case now.Before(startsAt):
		return StatusScheduled
	case endsAt != nil && !now.Before(*endsAt):
		return StatusExpired
	default:
		return StatusActive
	}
}

// Event is the exception as its events carry it (§15.1).
func (x EntitlementException) Event() ExceptionEvent {
	return ExceptionEvent{
		ID: x.ID, InstanceSlug: x.InstanceSlug, EntitlementSlug: x.EntitlementSlug, Kind: x.Kind, Value: x.Value,
		StartsAt: x.StartsAt, EndsAt: x.EndsAt, Reason: x.Reason, RevokedAt: x.RevokedAt,
	}
}
