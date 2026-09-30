package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/deleterelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getreleases"
)

// registerReleases publishes the releases module's four operations and the two
// webhook contracts its writes emit. A release is immutable once created, so there
// is no update operation and consequently no update event.
func registerReleases(core huma.API, app kaiten.Releases) {
	createrelease.RegisterEndpoint(core, app)
	createrelease.RegisterWebhook(core)
	deleterelease.RegisterEndpoint(core, app)
	deleterelease.RegisterWebhook(core)
	getrelease.RegisterEndpoint(core, app)
	getreleases.RegisterEndpoint(core, app)
}
