package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/deleteinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/deleteintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/exportorganizationusagereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/exportusagereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getaudittrails"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementsusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstances"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/listusagereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/patchinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateintegrations"
)

// registerInstances publishes the instances module's seventeen operations and the
// fourteen webhook declarations they carry -- the largest webhook surface in the
// tree, because an instance's entitlement usage is what customers integrate
// against.
//
// getentitlementusagemetrics declares one despite being a read: the event is a
// read-audit signal, which is a state change from the subscriber's point of view
// even though it is not one here.
//
// Every one of the seventeen is handed the same value -- the facade's instances
// surface -- and each takes it as its own one-method interface, so what an operation
// can reach is what it named.
func registerInstances(core huma.API, app kaiten.Instances) {
	createintegrations.RegisterEndpoint(core, app)
	createinstance.RegisterEndpoint(core, app)
	createinstance.RegisterWebhook(core)
	deleteintegrations.RegisterEndpoint(core, app)
	deleteinstance.RegisterEndpoint(core, app)
	deleteinstance.RegisterWebhook(core)
	getintegrations.RegisterEndpoint(core, app)
	getinstance.RegisterEndpoint(core, app)
	getinstances.RegisterEndpoint(core, app)
	patchinstance.RegisterEndpoint(core, app)
	patchinstance.RegisterWebhook(core)
	updateintegrations.RegisterEndpoint(core, app)
	updateinstance.RegisterEndpoint(core, app)
	updateinstance.RegisterWebhook(core)
	reportentitlementusagemetric.RegisterEndpoint(core, app)
	reportentitlementusagemetric.RegisterWebhook(core)
	getentitlementusagemetrics.RegisterEndpoint(core, app)
	getentitlementusagemetrics.RegisterWebhook(core)
	getentitlementsusagemetrics.RegisterEndpoint(core, app)
	getaudittrails.RegisterEndpoint(core, app)
	listusagereports.RegisterEndpoint(core, app)
	exportusagereports.RegisterEndpoint(core, app)
	exportorganizationusagereports.RegisterEndpoint(core, app)
}
