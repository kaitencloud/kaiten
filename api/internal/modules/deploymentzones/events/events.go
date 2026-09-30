package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	DeploymentZoneCreated = events.New("DEPLOYMENT_ZONE_CREATED", "com.kaiten.deployment_zone.v1.created")
	DeploymentZoneUpdated = events.New("DEPLOYMENT_ZONE_UPDATED", "com.kaiten.deployment_zone.v1.updated")
	DeploymentZoneDeleted = events.New("DEPLOYMENT_ZONE_DELETED", "com.kaiten.deployment_zone.v1.deleted")
	ReleaseDeployed       = events.New("RELEASE_DEPLOYED", "com.kaiten.deployment_zone.v1.release_deployed")
)
