package deleteentitlementresource

import "github.com/google/uuid"

// InstanceEntitlementResourceDeleted is the outbox payload for
// INSTANCE_ENTITLEMENT_RESOURCE_DELETED. It spells the entitlement and the
// instance as the usage events of its family do, so that whatever attributes
// those to an entitlement attributes this one too; resourceKey is camelCase like
// the contract's every new name.
type InstanceEntitlementResourceDeleted struct {
	EntitlementID   uuid.UUID `json:"entitlement_id" doc:"Unique identifier for the entitlement"`
	EntitlementSlug string    `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement"`
	InstanceID      uuid.UUID `json:"instance_id" doc:"Unique identifier for the instance the resource was counted on"`
	ResourceKey     string    `json:"resourceKey" doc:"The resource whose counter was forgotten"`
	Value           float64   `json:"value" doc:"The counter as it was stored when the resource was deleted: for a periodic entitlement, the value of the usage window the resource last reported in"`
	EventCount      int32     `json:"event_count" doc:"Number of reports folded into that counter"`
}
