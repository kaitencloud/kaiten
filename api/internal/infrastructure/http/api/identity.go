package api

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createtokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deletetokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getplatformcredential"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccounts"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccounttokens"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/listorganizationtokens"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/mintorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/revokeorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/updateserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/validatetoken"
)

// registerIdentity publishes the identity module onto both documents. It is the
// only module that spans them, because it owns every token: the seven
// service-account operations a tenant reaches on the Core API and the three
// credential operations only the platform may reach.
//
// Which surface an operation belongs to is decided here, once, rather than by a
// path prefix a future route could get wrong -- and the split is not a hierarchy:
// an operation is on exactly one document.
//
// Each of the three arguments the operations are handed is a different relationship
// to the facade. The Core operations take kaiten.ServiceAccounts and the platform
// ones kaiten.Platform -- two namespaces rather than one because identity's
// operations are split by credential class, and a namespace holding both would let
// an operation reach the other class's methods. The third is a use case passed
// directly, and it is the one permanent exception: validatetoken authenticates
// rather than acts, so there is no caller to hand it.
func registerIdentity(
	core, platform huma.API,
	router fiber.Router,
	validateToken validatetoken.UseCase,
	serviceAccounts kaiten.ServiceAccounts,
	app kaiten.Platform,
) {
	createserviceaccount.RegisterEndpoint(core, serviceAccounts)
	getserviceaccount.RegisterEndpoint(core, serviceAccounts)
	getserviceaccounts.RegisterEndpoint(core, serviceAccounts)
	updateserviceaccount.RegisterEndpoint(core, serviceAccounts)
	createtokenonserviceaccount.RegisterEndpoint(core, serviceAccounts)
	deletetokenonserviceaccount.RegisterEndpoint(core, serviceAccounts)
	getserviceaccounttokens.RegisterEndpoint(core, serviceAccounts)

	// The ext_authz check Envoy calls, and the one identity route that takes the
	// Fiber router alone: it answers any method, hands the minted JWT back in a
	// header rather than a body, and is deliberately in neither document -- it is
	// how a request is authenticated, not something a client calls. See its
	// RegisterEndpoint for the proxy configuration that pins it to one path, and
	// isPublicAPIPath for the allowlist entry that lets it answer at all.
	//
	// It is also the one operation in the tree that still takes its use case rather
	// than a facade method, because a facade method takes a caller and this is what
	// produces one. See internal/kaiten/serviceaccounts.go for the reasoning.
	validatetoken.RegisterEndpoint(router, validateToken)

	// A webhook contract, not an operation -- RegisterWebhook writes the
	// `webhooks:` section and registers no route. It is declared on the Core
	// document although the operation that emits the event is on the Platform one,
	// because the event is delivered to the target tenant and tenants read the
	// Core document.
	mintorganizationtoken.RegisterWebhook(core)

	getplatformcredential.RegisterEndpoint(platform, app)
	mintorganizationtoken.RegisterEndpoint(platform, app)
	listorganizationtokens.RegisterEndpoint(platform, app)
	revokeorganizationtoken.RegisterEndpoint(platform, app)
}
