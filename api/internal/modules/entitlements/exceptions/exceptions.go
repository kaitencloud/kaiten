// Package exceptions is what the entitlement exception use cases share: the
// shape of their events and its webhook contracts (V32-03 a, §13.16).
//
// An exception is the vendor's explicit, dated decision about one
// entitlement of one instance, given without a code: the last layer of the
// effective view. It is an entitlement feature, not a billing one, so its
// events are emitted whether or not billing is enabled.
package exceptions

import (
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
	Value     any        `json:"value" nullable:"true" doc:"The exception's value: a number for NUMBER and NUMBER_AI_CREDIT, a boolean for BOOLEAN, the CONFIG document as an object; null for UNLIMITED"`
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
