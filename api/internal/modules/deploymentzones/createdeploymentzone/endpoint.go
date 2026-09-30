package createdeploymentzone

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*schema.DeploymentZone, error)
}

type Request struct {
	Body schema.DeploymentZone
}

type Response struct {
	Body *schema.DeploymentZone
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "create-deployment-zone",
		Method:      http.MethodPost,
		Path:        "/deployment-zones",
		Summary:     "Create a new deployment zone",
		Description: "Create a new deployment zone with the provided details. Supplying releaseId " +
			"records the zone's first deployment. " +
			"A deployment zone is one place a customer runs a release -- a target they name " +
			"and classify themselves, holding the release currently on it. It is not an " +
			"installation of Kaiten; that sense of the term belongs to operations and is " +
			"not reachable through this API.",
		Tags:          []string{"deploymentZones"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var slug *string
		if request.Body.Slug != "" {
			slug = &request.Body.Slug
		}
		command := &Command{
			Name:        request.Body.Name,
			Type:        request.Body.Type,
			Metadata:    request.Body.Metadata,
			Description: request.Body.Description,
			ReleaseID:   request.Body.ReleaseID,
			Slug:        slug,
		}

		deploymentZone, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}
		return &Response{
			Body: deploymentZone,
		}, nil
	})
}

// RegisterWebhook declares the DeploymentZoneCreated webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       deploymentZoneEvents.DeploymentZoneCreated,
		Data:        (*schema.DeploymentZone)(nil),
		OperationID: "onDeploymentZoneCreated",
		Summary:     "Deployment Zone Created Webhook",
		Description: "Triggered when a new deployment zone is created.",
		Tags:        []string{"webhooks", "deploymentZones"},
	})
}
