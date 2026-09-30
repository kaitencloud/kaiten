package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/getintegration"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
)

// registerIntegrations publishes the integrations module's four operations from its
// two use cases.
//
// Each use case answers two operations -- one keyed by a customer's external id, one
// by an instance's -- so each RegisterEndpoint registers both, and the interface it
// declares names two facade methods rather than one. They declare no webhook
// contracts: an integration record is a mapping to a foreign system's identifier, and
// the writes worth announcing are the ones on the customer or instance it maps.
func registerIntegrations(core huma.API, app kaiten.Integrations) {
	getintegration.RegisterEndpoint(core, app)
	upsertintegration.RegisterEndpoint(core, app)
}
