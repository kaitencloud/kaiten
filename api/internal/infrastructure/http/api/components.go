package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/deletecomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponents"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/updatecomponent"
)

// registerComponents publishes the components module's five operations, and the
// three webhook contracts its writes emit.
func registerComponents(core huma.API, app kaiten.Components) {
	createcomponent.RegisterEndpoint(core, app)
	createcomponent.RegisterWebhook(core)
	deletecomponent.RegisterEndpoint(core, app)
	deletecomponent.RegisterWebhook(core)
	getcomponent.RegisterEndpoint(core, app)
	getcomponents.RegisterEndpoint(core, app)
	updatecomponent.RegisterEndpoint(core, app)
	updatecomponent.RegisterWebhook(core)
}
