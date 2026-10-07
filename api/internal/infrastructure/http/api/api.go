package api

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/pkg/subscribers"
)

// Deps is everything registration needs from the server.
//
// A struct rather than four positional arguments plus the application, because two
// of the four are huma.API and two are fiber.Router: nothing but the field name
// distinguishes them, and a Core operation registered on the Platform document is
// precisely the mistake the two-surface split exists to prevent. That mistake now
// also puts the operation on the wrong PORT, which is the strongest reason yet for
// the field names to be the only way to tell these apart.
type Deps struct {
	// Core is the /api document on the PUBLIC listener: tenant operations, reached
	// with an organization credential.
	Core huma.API
	// Platform is the /api/platform document on the INTERNAL listener:
	// cross-organization operations, reached with a ksm_ platform credential.
	//
	// The two are built on different Fiber apps listening on different ports, so
	// which of these fields an operation is registered against decides which port
	// it answers on -- not just which document it appears in. See
	// internal/infrastructure/http/server.
	Platform huma.API
	// Router is the PUBLIC listener's /api Fiber group, for the handful of
	// operations that answer outside huma -- OFREP's two, and the ext_authz
	// token-validation route. There is deliberately no equivalent for the Platform
	// listener: everything it serves is a huma operation.
	Router fiber.Router
	// DaprGroup is the /dapr group. The server creates it before installing any auth
	// middleware, so subscriber routes are never inside the authentication pipeline.
	DaprGroup fiber.Router
	// App is the constructed application. Registration reads use cases off it and
	// builds nothing -- see the package doc.
	App *kaiten.Kaiten
}

// Register publishes every operation, webhook contract and subscriber route this
// application has.
func Register(deps Deps) {
	m := deps.App.Modules()

	// Every Platform operation is handed the same value: the facade's platform
	// surface, which owns the credential class, the scope and -- for the {orgId}
	// namespace -- the target organization's existence. The registrars publish the
	// scope into the document and record the attempt, and decide nothing.
	platform := deps.App.Platform()

	// organization and users publish nothing on the Core document: all four of their
	// operations take an organization or user id from the path and authorize on a
	// scope alone, so they are Platform operations and moved there wholesale.
	registerOrganization(deps.Platform, platform)
	registerUsers(deps.Platform, platform)

	registerComponents(deps.Core, deps.App.Components())
	registerConnectors(deps.Core, deps.Platform, deps.App.Connectors(), platform)
	registerCustomers(deps.Core, deps.App.Customers())
	registerDeploymentZones(deps.Core, deps.App.DeploymentZones())
	registerMetadataFields(deps.Core, deps.App.MetadataFields())
	registerReleases(deps.Core, deps.App.Releases())
	registerEntitlements(deps.Core, deps.App.Entitlements())
	registerLicenses(deps.Core, deps.App.Licenses())
	registerBilling(deps.Core, deps.Platform, deps.App.Billing(), platform)
	registerAddons(deps.Core, deps.App.Addons())
	registerVouchers(deps.Core, deps.App.Vouchers())
	registerPublicSDK(deps.Core, deps.App.PublicSDK())
	registerIntegrations(deps.Core, deps.App.Integrations())
	registerInstances(deps.Core, deps.App.Instances())
	registerFeatureFlags(deps.Core, deps.Router, deps.App.FeatureFlags())
	registerNotifications(deps.Core, deps.Router, deps.App.Notifications())

	// identity is the only module with operations on both documents, so it is the one
	// module handed two facade namespaces -- and the only one still handed a use case,
	// for the ext_authz check that authenticates rather than acts.
	registerIdentity(
		deps.Core, deps.Platform, deps.Router,
		m.Identity.ValidateToken, deps.App.ServiceAccounts(), platform)

	// Subscriber routes are registered first and their metadata collected, so
	// GET /dapr/subscribe answers with the complete subscription list.
	subscribers.Mount(deps.DaprGroup, registerCDC(deps.DaprGroup, deps.App.Events()))
}
