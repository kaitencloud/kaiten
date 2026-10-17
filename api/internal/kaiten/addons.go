package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/archiveaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/assignaddonentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/attachinstanceaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/createaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/createaddonprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/deleteaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/deprecateaddonprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/detachinstanceaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/getaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/getaddonentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/getaddonfamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listaddoncompatibility"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listaddonentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listaddonfamilies"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listaddonprices"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listaddons"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listinstanceaddons"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/publishaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/removeaddoncompatibility"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/setaddoncompatibility"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/setinstanceaddonquantity"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/unarchiveaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/unassignaddonentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/updateaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/updateaddonentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/updateaddonfamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Addons is the add-on module's operations: the add-on catalogue, and the
// add-ons instances hold. Every one of them is behind the billing switch.
//
// See Customers for the naming and argument-order convention.
type Addons struct {
	uc *addons.UseCases
}

// Addons returns the add-on surface.
func (k *Kaiten) Addons() Addons {
	return Addons{uc: k.modules.Addons}
}

func (a Addons) ListFamilies(ctx context.Context, cl caller.OrganizationCaller) ([]catalogue.AddonFamily, error) {
	if err := cl.Require(listaddonfamilies.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.ListFamilies.Execute(bindOrganization(ctx, cl))
}

func (a Addons) GetFamily(ctx context.Context, cl caller.OrganizationCaller, familySlug string) (*catalogue.AddonFamily, error) {
	if err := cl.Require(getaddonfamily.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.GetFamily.Execute(bindOrganization(ctx, cl), familySlug)
}

func (a Addons) UpdateFamily(ctx context.Context, cl caller.OrganizationCaller, familySlug string, isPublic bool) (*catalogue.AddonFamily, error) {
	if err := cl.Require(updateaddonfamily.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.UpdateFamily.Execute(bindOrganization(ctx, cl), familySlug, isPublic)
}

func (a Addons) CreateAddon(ctx context.Context, cl caller.OrganizationCaller, command createaddon.NewAddon) (*catalogue.Addon, error) {
	if err := cl.Require(createaddon.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.CreateAddon.Execute(bindOrganization(ctx, cl), command)
}

func (a Addons) ListAddons(ctx context.Context, cl caller.OrganizationCaller, lifecycleState, familySlug, cursor string, limit int32) (pagination.Page[catalogue.Addon], error) {
	if err := cl.Require(listaddons.RequiredScope); err != nil {
		return pagination.Page[catalogue.Addon]{}, err
	}
	return a.uc.ListAddons.Execute(bindOrganization(ctx, cl), lifecycleState, familySlug, cursor, limit)
}

func (a Addons) GetAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*catalogue.Addon, error) {
	if err := cl.Require(getaddon.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.GetAddon.Execute(bindOrganization(ctx, cl), addonSlug)
}

func (a Addons) UpdateAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, command updateaddon.AddonChanges) (*catalogue.Addon, error) {
	if err := cl.Require(updateaddon.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.UpdateAddon.Execute(bindOrganization(ctx, cl), addonSlug, command)
}

func (a Addons) DeleteAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) error {
	if err := cl.Require(deleteaddon.RequiredScope); err != nil {
		return err
	}
	return a.uc.DeleteAddon.Execute(bindOrganization(ctx, cl), addonSlug)
}

func (a Addons) PublishAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*catalogue.Addon, error) {
	if err := cl.Require(publishaddon.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.PublishAddon.Execute(bindOrganization(ctx, cl), addonSlug)
}

func (a Addons) ArchiveAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*catalogue.Addon, error) {
	if err := cl.Require(archiveaddon.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.ArchiveAddon.Execute(bindOrganization(ctx, cl), addonSlug)
}

func (a Addons) UnarchiveAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*catalogue.Addon, error) {
	if err := cl.Require(unarchiveaddon.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.UnarchiveAddon.Execute(bindOrganization(ctx, cl), addonSlug)
}

func (a Addons) ListPrices(ctx context.Context, cl caller.OrganizationCaller, addonSlug, status string) ([]prices.Price, error) {
	if err := cl.Require(listaddonprices.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.ListPrices.Execute(bindOrganization(ctx, cl), addonSlug, status)
}

func (a Addons) CreatePrice(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, command createaddonprice.NewAddonPrice) (*prices.Price, error) {
	if err := cl.Require(createaddonprice.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.CreatePrice.Execute(bindOrganization(ctx, cl), addonSlug, command)
}

func (a Addons) DeprecatePrice(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, priceID uuid.UUID) (*prices.Price, error) {
	if err := cl.Require(deprecateaddonprice.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.DeprecatePrice.Execute(bindOrganization(ctx, cl), addonSlug, priceID)
}

func (a Addons) ListEntitlements(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) ([]catalogue.AddonEntitlement, error) {
	if err := cl.Require(listaddonentitlements.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.ListEntitlements.Execute(bindOrganization(ctx, cl), addonSlug)
}

func (a Addons) GetEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug, entitlementSlug string) (*catalogue.AddonEntitlement, error) {
	if err := cl.Require(getaddonentitlement.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.GetEntitlement.Execute(bindOrganization(ctx, cl), addonSlug, entitlementSlug)
}

func (a Addons) AssignEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, command assignaddonentitlement.NewAddonGrant) (*catalogue.AddonEntitlement, error) {
	if err := cl.Require(assignaddonentitlement.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.AssignEntitlement.Execute(bindOrganization(ctx, cl), addonSlug, command)
}

func (a Addons) UpdateEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug, entitlementSlug string, command updateaddonentitlement.AddonGrantChanges) (*catalogue.AddonEntitlement, error) {
	if err := cl.Require(updateaddonentitlement.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.UpdateEntitlement.Execute(bindOrganization(ctx, cl), addonSlug, entitlementSlug, command)
}

func (a Addons) UnassignEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug, entitlementSlug string) error {
	if err := cl.Require(unassignaddonentitlement.RequiredScope); err != nil {
		return err
	}
	return a.uc.UnassignEntitlement.Execute(bindOrganization(ctx, cl), addonSlug, entitlementSlug)
}

func (a Addons) ListCompatibility(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*listaddoncompatibility.CompatibleLicenseFamilies, error) {
	if err := cl.Require(listaddoncompatibility.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.ListCompatibility.Execute(bindOrganization(ctx, cl), addonSlug)
}

func (a Addons) SetCompatibility(ctx context.Context, cl caller.OrganizationCaller, addonSlug, familySlug string) error {
	if err := cl.Require(setaddoncompatibility.RequiredScope); err != nil {
		return err
	}
	return a.uc.SetCompatibility.Execute(bindOrganization(ctx, cl), addonSlug, familySlug)
}

func (a Addons) RemoveCompatibility(ctx context.Context, cl caller.OrganizationCaller, addonSlug, familySlug string) error {
	if err := cl.Require(removeaddoncompatibility.RequiredScope); err != nil {
		return err
	}
	return a.uc.RemoveCompatibility.Execute(bindOrganization(ctx, cl), addonSlug, familySlug)
}

func (a Addons) ListInstanceAddons(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, includeRemoved bool) ([]catalogue.InstanceAddon, error) {
	if err := cl.Require(listinstanceaddons.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.ListInstanceAddons.Execute(bindOrganization(ctx, cl), instanceSlug, includeRemoved)
}

func (a Addons) AttachInstanceAddon(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, command attachinstanceaddon.NewInstanceAddon) (*catalogue.InstanceAddon, error) {
	if err := cl.Require(attachinstanceaddon.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.AttachInstanceAddon.Execute(bindOrganization(ctx, cl), instanceSlug, command)
}

func (a Addons) SetInstanceAddonQuantity(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, addonSlug string, quantity int32) (*catalogue.InstanceAddon, error) {
	if err := cl.Require(setinstanceaddonquantity.RequiredScope); err != nil {
		return nil, err
	}
	return a.uc.SetInstanceAddonQuantity.Execute(bindOrganization(ctx, cl), instanceSlug, addonSlug, quantity)
}

func (a Addons) DetachInstanceAddon(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, addonSlug string) error {
	if err := cl.Require(detachinstanceaddon.RequiredScope); err != nil {
		return err
	}
	return a.uc.DetachInstanceAddon.Execute(bindOrganization(ctx, cl), instanceSlug, addonSlug)
}
