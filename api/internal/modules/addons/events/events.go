// Package events names the events the add-on module records.
package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	AddonCreated    = events.New("ADDON_CREATED", "com.kaiten.addon.v1.created")
	AddonUpdated    = events.New("ADDON_UPDATED", "com.kaiten.addon.v1.updated")
	AddonDeleted    = events.New("ADDON_DELETED", "com.kaiten.addon.v1.deleted")
	AddonPublished  = events.New("ADDON_PUBLISHED", "com.kaiten.addon.v1.published")
	AddonArchived   = events.New("ADDON_ARCHIVED", "com.kaiten.addon.v1.archived")
	AddonUnarchived = events.New("ADDON_UNARCHIVED", "com.kaiten.addon.v1.unarchived")

	AddonPriceCreated    = events.New("ADDON_PRICE_CREATED", "com.kaiten.addon.price.v1.created")
	AddonPriceDeprecated = events.New("ADDON_PRICE_DEPRECATED", "com.kaiten.addon.price.v1.deprecated")

	AddonEntitlementAssigned   = events.New("ADDON_ENTITLEMENT_ASSIGNED", "com.kaiten.addon.entitlement.v1.assigned")
	AddonEntitlementUpdated    = events.New("ADDON_ENTITLEMENT_UPDATED", "com.kaiten.addon.entitlement.v1.updated")
	AddonEntitlementUnassigned = events.New("ADDON_ENTITLEMENT_UNASSIGNED", "com.kaiten.addon.entitlement.v1.unassigned")

	InstanceAddonAdded           = events.New("INSTANCE_ADDON_ADDED", "com.kaiten.instance.addon.v1.added")
	InstanceAddonRemoved         = events.New("INSTANCE_ADDON_REMOVED", "com.kaiten.instance.addon.v1.removed")
	InstanceAddonQuantityChanged = events.New("INSTANCE_ADDON_QUANTITY_CHANGED", "com.kaiten.instance.addon.v1.quantity_changed")
)
