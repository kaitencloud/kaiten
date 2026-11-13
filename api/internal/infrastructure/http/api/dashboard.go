package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/getsummary"
)

// registerDashboard publishes the console's home: one read, computed in the
// database over the whole organization.
func registerDashboard(core huma.API, app kaiten.Dashboard) {
	getsummary.RegisterEndpoint(core, app)
}
