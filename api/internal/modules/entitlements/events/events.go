package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	EntitlementCreated      = events.New("ENTITLEMENT_CREATED", "com.kaiten.entitlement.v1.created")
	EntitlementUpdated      = events.New("ENTITLEMENT_UPDATED", "com.kaiten.entitlement.v1.updated")
	EntitlementDeleted      = events.New("ENTITLEMENT_DELETED", "com.kaiten.entitlement.v1.deleted")
	EntitlementGroupCreated = events.New("ENTITLEMENT_GROUP_CREATED", "com.kaiten.entitlement_group.v1.created")
	EntitlementGroupUpdated = events.New("ENTITLEMENT_GROUP_UPDATED", "com.kaiten.entitlement_group.v1.updated")
	EntitlementGroupDeleted = events.New("ENTITLEMENT_GROUP_DELETED", "com.kaiten.entitlement_group.v1.deleted")

	// The vendor's exceptions on one instance's entitlement (V32-03 a):
	// instance events, emitted whether or not billing is enabled.
	InstanceEntitlementExceptionCreated = events.New("INSTANCE_ENTITLEMENT_EXCEPTION_CREATED", "com.kaiten.instance.entitlement_exception.v1.created")
	InstanceEntitlementExceptionRevoked = events.New("INSTANCE_ENTITLEMENT_EXCEPTION_REVOKED", "com.kaiten.instance.entitlement_exception.v1.revoked")
	InstanceEntitlementExceptionExpired = events.New("INSTANCE_ENTITLEMENT_EXCEPTION_EXPIRED", "com.kaiten.instance.entitlement_exception.v1.expired")
)
