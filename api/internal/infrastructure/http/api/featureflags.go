package api

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/createfeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/deletefeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/getfeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/getfeatureflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/gettargetingcontext"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/linttargetingrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/manifest/getmanifest"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/bulkevaluateflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/evaluateflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/testtargetingrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/updatefeatureflag"
)

// registerFeatureFlags publishes the feature flags module's eight operations onto
// the Core document, its four webhook contracts, and its targeting schemas.
//
// Three of the four contracts come from the flag writes. The fourth is the
// evaluation event, declared by the module rather than by an operation because the
// publisher emits it from every evaluation path -- OFREP, the manifest, and any
// in-process caller -- so it belongs to none of them.
//
// This is the one module that needs the Fiber router as well as the document. The
// two OFREP operations answer on a raw Fiber route -- the OpenFeature protocol
// fixes their response shape, which huma cannot express -- and are hand-documented
// alongside it, so each takes both. See their endpoint_openapi.go.
//
// RegisterFeatureFlagSchemas rewrites the Targetings schema's anyOf to reference
// the three concrete targeting types by name, which huma's reflection cannot
// produce on its own. It has to run after the operations that reference those
// types are registered, so the order of these calls is load-bearing.
//
// The module package is still named here, for the two registrations that belong to
// the module rather than to any of its operations. The operations themselves take
// the facade's feature flags surface, each as its own one-method interface.
func registerFeatureFlags(core huma.API, router fiber.Router, app kaiten.FeatureFlags) {
	createfeatureflag.RegisterEndpoint(core, app)
	createfeatureflag.RegisterWebhook(core)
	deletefeatureflag.RegisterEndpoint(core, app)
	deletefeatureflag.RegisterWebhook(core)
	getfeatureflag.RegisterEndpoint(core, app)
	getfeatureflags.RegisterEndpoint(core, app)
	gettargetingcontext.RegisterEndpoint(core, app)
	linttargetingrule.RegisterEndpoint(core, app)
	testtargetingrule.RegisterEndpoint(core, app)
	updatefeatureflag.RegisterEndpoint(core, app)
	updatefeatureflag.RegisterWebhook(core)
	evaluateflag.RegisterEndpoint(core, router, app)
	bulkevaluateflags.RegisterEndpoint(core, router, app)
	getmanifest.RegisterEndpoint(core, app)
	featureflags.RegisterFeatureFlagSchemas(core)
	featureflags.RegisterWebhook(core)
}
