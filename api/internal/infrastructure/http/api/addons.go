package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
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

// registerAddons publishes the add-on module's operations and the webhook
// contracts its writes emit.
func registerAddons(core huma.API, app kaiten.Addons) {
	listaddonfamilies.RegisterEndpoint(core, app)
	getaddonfamily.RegisterEndpoint(core, app)
	updateaddonfamily.RegisterEndpoint(core, app)
	createaddon.RegisterEndpoint(core, app)
	listaddons.RegisterEndpoint(core, app)
	getaddon.RegisterEndpoint(core, app)
	updateaddon.RegisterEndpoint(core, app)
	deleteaddon.RegisterEndpoint(core, app)
	publishaddon.RegisterEndpoint(core, app)
	archiveaddon.RegisterEndpoint(core, app)
	unarchiveaddon.RegisterEndpoint(core, app)
	listaddonprices.RegisterEndpoint(core, app)
	createaddonprice.RegisterEndpoint(core, app)
	deprecateaddonprice.RegisterEndpoint(core, app)
	listaddonentitlements.RegisterEndpoint(core, app)
	getaddonentitlement.RegisterEndpoint(core, app)
	assignaddonentitlement.RegisterEndpoint(core, app)
	updateaddonentitlement.RegisterEndpoint(core, app)
	unassignaddonentitlement.RegisterEndpoint(core, app)
	listaddoncompatibility.RegisterEndpoint(core, app)
	setaddoncompatibility.RegisterEndpoint(core, app)
	removeaddoncompatibility.RegisterEndpoint(core, app)
	listinstanceaddons.RegisterEndpoint(core, app)
	attachinstanceaddon.RegisterEndpoint(core, app)
	setinstanceaddonquantity.RegisterEndpoint(core, app)
	detachinstanceaddon.RegisterEndpoint(core, app)
	catalogue.RegisterWebhooks(core)
}
