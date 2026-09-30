package updatedeploymentzone

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) error
}

// Request's Body is schema.DeploymentZone, the same type create-deployment-
// zone and get-deployment-zone use. Slug is structurally writable on it, but
// this endpoint has never supported renaming a zone -- see the handler
// below, which rejects a slug that differs from the path's.
type Request struct {
	Slug string `path:"deploymentZoneSlug"`
	Body schema.DeploymentZone
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-deploymentZone",
		Method:      http.MethodPut,
		Path:        "/deployment-zones/{deploymentZoneSlug}",
		Summary:     "Update a deployment zone",
		Description: "Update a deployment zone's details. Changing releaseId records a deployment: the zone's current release becomes the new one and the change is appended to its deployment history, including when the new release is one the zone already ran (a rollback). Omitting releaseId, or echoing back the current one, leaves the history untouched.",
		Tags:        []string{"deploymentZones"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.Slug != "" && request.Body.Slug != request.Slug {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateDeploymentZone.SlugNotRenameable",
				"slug cannot be changed through this endpoint; omit it or send the current slug",
			)
		}

		command := &Command{
			Name:        request.Body.Name,
			Type:        request.Body.Type,
			Metadata:    request.Body.Metadata,
			Description: request.Body.Description,
			ReleaseID:   request.Body.ReleaseID,
		}

		if err := app.Update(ctx, cl, request.Slug, command); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

// RegisterWebhook declares the DeploymentZoneUpdated webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       deploymentZoneEvents.DeploymentZoneUpdated,
		Data:        (*schema.DeploymentZone)(nil),
		OperationID: "onDeploymentZoneUpdated",
		Summary:     "Deployment Zone Updated Webhook",
		Description: "Triggered when a deployment zone is updated.",
		Tags:        []string{"webhooks", "deploymentZones"},
	})
}
