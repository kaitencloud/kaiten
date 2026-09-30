package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/addentitlementtogroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/deleteentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/deleteentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroups"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroupusage"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/removeentitlementfromgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/updateentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/updateentitlementgroup"
)

// registerEntitlements publishes the entitlements module's thirteen operations,
// and the six webhook contracts its entitlement and group writes emit.
//
// All thirteen receive the same value -- the facade's entitlements surface -- and
// each takes it as its own one-method interface, so what an operation can reach is
// what it named. The two aggregates share the surface because they share a module:
// a group's usage is an aggregate over its members, and nothing would be gained by
// splitting them into two namespaces that had to call each other.
func registerEntitlements(core huma.API, app kaiten.Entitlements) {
	createentitlement.RegisterEndpoint(core, app)
	createentitlement.RegisterWebhook(core)
	deleteentitlement.RegisterEndpoint(core, app)
	deleteentitlement.RegisterWebhook(core)
	getentitlement.RegisterEndpoint(core, app)
	getentitlements.RegisterEndpoint(core, app)
	updateentitlement.RegisterEndpoint(core, app)
	updateentitlement.RegisterWebhook(core)
	createentitlementgroup.RegisterEndpoint(core, app)
	createentitlementgroup.RegisterWebhook(core)
	getentitlementgroup.RegisterEndpoint(core, app)
	getentitlementgroups.RegisterEndpoint(core, app)
	updateentitlementgroup.RegisterEndpoint(core, app)
	updateentitlementgroup.RegisterWebhook(core)
	deleteentitlementgroup.RegisterEndpoint(core, app)
	deleteentitlementgroup.RegisterWebhook(core)
	addentitlementtogroup.RegisterEndpoint(core, app)
	removeentitlementfromgroup.RegisterEndpoint(core, app)
	getentitlementgroupusage.RegisterEndpoint(core, app)
}
