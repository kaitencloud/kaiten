package catalogue

import (
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenevents "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

// InstanceAddon is an add-on an instance holds, or held.
type InstanceAddon struct {
	ID          uuid.UUID      `json:"id" readOnly:"true"`
	AddonID     uuid.UUID      `json:"addonId"`
	AddonSlug   string         `json:"addonSlug" example:"extra-seats-v1"`
	FamilySlug  string         `json:"familySlug" example:"extra-seats"`
	Name        string         `json:"name" doc:"The add-on version's name" example:"Extra seats"`
	Quantity    int32          `json:"quantity" example:"3"`
	MaxQuantity *int32         `json:"maxQuantity,omitempty"`
	AttachedAt  time.Time      `json:"attachedAt"`
	RemovedAt   *time.Time     `json:"removedAt,omitempty"`
	Prices      []prices.Price `json:"prices" nullable:"false" doc:"What the instance's subscription bills for it: the default FLAT_FEE price of the subscription's period and the ACTIVE metered prices. Empty when the instance is not billed."`
}

// AddonUpdate is the payload of ADDON_UPDATED.
type AddonUpdate struct {
	Addon
	ChangedFields             []string `json:"changedFields" doc:"The members the change touched, as the API names them"`
	CompatibleLicenseFamilies []string `json:"compatibleLicenseFamilies" doc:"The licence families the version fits after the change"`
}

// DeletedAddon is the payload of ADDON_DELETED.
type DeletedAddon struct {
	ID         uuid.UUID `json:"id"`
	Slug       string    `json:"slug"`
	FamilySlug string    `json:"familySlug"`
}

// AddonPriceUpdate is the payload of ADDON_PRICE_CREATED and ADDON_PRICE_DEPRECATED.
type AddonPriceUpdate struct {
	prices.Price
	AddonSlug string `json:"addonSlug" doc:"The add-on version the price belongs to"`
}

// AddonGrantUpdate is the payload of the ADDON_ENTITLEMENT_* events.
type AddonGrantUpdate struct {
	AddonEntitlement
	AddonSlug string `json:"addonSlug" doc:"The add-on version the grant belongs to"`
}

// InstanceAddonUpdate is the payload of the INSTANCE_ADDON_* events.
type InstanceAddonUpdate struct {
	InstanceAddon
	InstanceSlug     string `json:"instanceSlug"`
	PreviousQuantity *int32 `json:"previousQuantity,omitempty" doc:"The quantity before a quantity change"`
}

// RegisterWebhooks declares the add-on events' webhook contracts.
func RegisterWebhooks(api huma.API) {
	webhook.Declare(api,
		declaration(events.AddonCreated, (*Addon)(nil), "onAddonCreated", "Add-on Created", "Triggered when an add-on version is created."),
		declaration(events.AddonUpdated, (*AddonUpdate)(nil), "onAddonUpdated", "Add-on Updated", "Triggered when an add-on version, its compatibility or its family's visibility changes."),
		declaration(events.AddonDeleted, (*DeletedAddon)(nil), "onAddonDeleted", "Add-on Deleted", "Triggered when an add-on version is deleted."),
		declaration(events.AddonPublished, (*Addon)(nil), "onAddonPublished", "Add-on Published", "Triggered when a draft add-on version goes on sale."),
		declaration(events.AddonArchived, (*Addon)(nil), "onAddonArchived", "Add-on Archived", "Triggered when an add-on version is withdrawn from sale."),
		declaration(events.AddonUnarchived, (*Addon)(nil), "onAddonUnarchived", "Add-on Unarchived", "Triggered when an archived add-on version goes back on sale."),
		declaration(events.AddonPriceCreated, (*AddonPriceUpdate)(nil), "onAddonPriceCreated", "Add-on Price Created", "Triggered when a price is added to an add-on version."),
		declaration(events.AddonPriceDeprecated, (*AddonPriceUpdate)(nil), "onAddonPriceDeprecated", "Add-on Price Deprecated", "Triggered when an add-on price stops being offered."),
		declaration(events.AddonEntitlementAssigned, (*AddonGrantUpdate)(nil), "onAddonEntitlementAssigned", "Add-on Entitlement Assigned", "Triggered when an add-on version grants an entitlement."),
		declaration(events.AddonEntitlementUpdated, (*AddonGrantUpdate)(nil), "onAddonEntitlementUpdated", "Add-on Entitlement Updated", "Triggered when an add-on grant changes."),
		declaration(events.AddonEntitlementUnassigned, (*AddonGrantUpdate)(nil), "onAddonEntitlementUnassigned", "Add-on Entitlement Unassigned", "Triggered when an add-on grant is removed."),
		declaration(events.InstanceAddonAdded, (*InstanceAddonUpdate)(nil), "onInstanceAddonAdded", "Instance Add-on Added", "Triggered when an add-on is attached to an instance."),
		declaration(events.InstanceAddonRemoved, (*InstanceAddonUpdate)(nil), "onInstanceAddonRemoved", "Instance Add-on Removed", "Triggered when an add-on is removed from an instance."),
		declaration(events.InstanceAddonQuantityChanged, (*InstanceAddonUpdate)(nil), "onInstanceAddonQuantityChanged", "Instance Add-on Quantity Changed", "Triggered when the quantity of an instance's add-on changes."),
	)
}

func declaration(event kaitenevents.Metadata, data any, operationID, summary, description string) webhook.Declaration {
	tag := "addons"
	if event.Name == events.InstanceAddonAdded.Name || event.Name == events.InstanceAddonRemoved.Name ||
		event.Name == events.InstanceAddonQuantityChanged.Name {
		tag = "instances"
	}
	return webhook.Declaration{
		Event: event, Data: data, OperationID: operationID, Summary: summary + " Webhook",
		Description: description, Tags: []string{"webhooks", tag},
	}
}
