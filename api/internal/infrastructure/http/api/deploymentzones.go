package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeployment"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/deletedeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzones"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/updatedeploymentzone"
)

// registerDeploymentZones publishes the deployment zones module's five
// operations and four webhook contracts.
//
// The fourth comes from createdeployment, which is a service rather than a use
// case: it has no endpoint because it runs inside the createdeploymentzone and
// updatedeploymentzone transactions. Its event is emitted by both of those, so the
// contract cannot hang off either one, and it is declared alongside the module's
// own rather than duplicated into the two operations that trigger it.
// createdeployment therefore appears here for its webhook alone, with no endpoint and
// no facade method: it has no caller of its own to authorize, so there is nothing for
// the facade to front. See kaiten.DeploymentZones.
func registerDeploymentZones(core huma.API, app kaiten.DeploymentZones) {
	createdeploymentzone.RegisterEndpoint(core, app)
	createdeploymentzone.RegisterWebhook(core)
	deletedeploymentzone.RegisterEndpoint(core, app)
	deletedeploymentzone.RegisterWebhook(core)
	getdeploymentzone.RegisterEndpoint(core, app)
	getdeploymentzones.RegisterEndpoint(core, app)
	updatedeploymentzone.RegisterEndpoint(core, app)
	updatedeploymentzone.RegisterWebhook(core)
	createdeployment.RegisterWebhook(core)
}
