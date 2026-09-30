package createdeployment

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
)

// RegisterWebhook declares the ReleaseDeployed webhook contract in the
// OpenAPI document. This service has no endpoint of its own -- it runs
// inside the createdeploymentzone and updatedeploymentzone transactions --
// so the deploymentzones module calls this directly.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       deploymentZoneEvents.ReleaseDeployed,
		Data:        (*schema.Deployment)(nil),
		OperationID: "onReleaseDeployed",
		Summary:     "Release Deployed Webhook",
		Description: "Triggered when a release is deployed to a deployment zone, either at zone creation or when an existing zone's release changes.",
		Tags:        []string{"webhooks", "deploymentZones"},
	})
}
