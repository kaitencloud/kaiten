// Package addons is the add-on module: the add-on catalogue and the add-ons
// instances hold.
package addons

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
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
)

type UseCases struct {
	ListFamilies             *listaddonfamilies.UseCase
	GetFamily                *getaddonfamily.UseCase
	UpdateFamily             *updateaddonfamily.UseCase
	CreateAddon              *createaddon.UseCase
	ListAddons               *listaddons.UseCase
	GetAddon                 *getaddon.UseCase
	UpdateAddon              *updateaddon.UseCase
	DeleteAddon              *deleteaddon.UseCase
	PublishAddon             *publishaddon.UseCase
	ArchiveAddon             *archiveaddon.UseCase
	UnarchiveAddon           *unarchiveaddon.UseCase
	ListPrices               *listaddonprices.UseCase
	CreatePrice              *createaddonprice.UseCase
	DeprecatePrice           *deprecateaddonprice.UseCase
	ListEntitlements         *listaddonentitlements.UseCase
	GetEntitlement           *getaddonentitlement.UseCase
	AssignEntitlement        *assignaddonentitlement.UseCase
	UpdateEntitlement        *updateaddonentitlement.UseCase
	UnassignEntitlement      *unassignaddonentitlement.UseCase
	ListCompatibility        *listaddoncompatibility.UseCase
	SetCompatibility         *setaddoncompatibility.UseCase
	RemoveCompatibility      *removeaddoncompatibility.UseCase
	ListInstanceAddons       *listinstanceaddons.UseCase
	AttachInstanceAddon      *attachinstanceaddon.UseCase
	SetInstanceAddonQuantity *setinstanceaddonquantity.UseCase
	DetachInstanceAddon      *detachinstanceaddon.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	deps := catalogue.Deps{
		UserProvider: svc.UserProvider,
		Uof:          svc.Uof,
		Gate:         gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
	}
	return &UseCases{
		ListFamilies:             listaddonfamilies.NewUseCase(deps),
		GetFamily:                getaddonfamily.NewUseCase(deps),
		UpdateFamily:             updateaddonfamily.NewUseCase(deps),
		CreateAddon:              createaddon.NewUseCase(deps),
		ListAddons:               listaddons.NewUseCase(deps),
		GetAddon:                 getaddon.NewUseCase(deps),
		UpdateAddon:              updateaddon.NewUseCase(deps),
		DeleteAddon:              deleteaddon.NewUseCase(deps),
		PublishAddon:             publishaddon.NewUseCase(deps),
		ArchiveAddon:             archiveaddon.NewUseCase(deps),
		UnarchiveAddon:           unarchiveaddon.NewUseCase(deps),
		ListPrices:               listaddonprices.NewUseCase(deps),
		CreatePrice:              createaddonprice.NewUseCase(deps),
		DeprecatePrice:           deprecateaddonprice.NewUseCase(deps),
		ListEntitlements:         listaddonentitlements.NewUseCase(deps),
		GetEntitlement:           getaddonentitlement.NewUseCase(deps),
		AssignEntitlement:        assignaddonentitlement.NewUseCase(deps),
		UpdateEntitlement:        updateaddonentitlement.NewUseCase(deps),
		UnassignEntitlement:      unassignaddonentitlement.NewUseCase(deps),
		ListCompatibility:        listaddoncompatibility.NewUseCase(deps),
		SetCompatibility:         setaddoncompatibility.NewUseCase(deps),
		RemoveCompatibility:      removeaddoncompatibility.NewUseCase(deps),
		ListInstanceAddons:       listinstanceaddons.NewUseCase(deps),
		AttachInstanceAddon:      attachinstanceaddon.NewUseCase(deps),
		SetInstanceAddonQuantity: setinstanceaddonquantity.NewUseCase(deps),
		DetachInstanceAddon:      detachinstanceaddon.NewUseCase(deps),
	}
}
