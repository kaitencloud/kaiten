package createinstance

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*schema.Instance, error)
}

type Request struct {
	Body schema.Instance
}

type Response struct {
	Body *schema.Instance
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "createInstance",
		Method:        "POST",
		Path:          "/instances",
		Summary:       "Create a new instance",
		Description:   "Create a new instance with the provided details",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, input *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var slug *string
		if input.Body.Slug != "" {
			slug = &input.Body.Slug
		}
		command := &Command{
			Name:             input.Body.Name,
			Description:      input.Body.Description,
			CustomerID:       input.Body.CustomerID,
			LicenseID:        input.Body.LicenseID,
			DeploymentZoneID: input.Body.DeploymentZoneID,
			Metadata:         input.Body.Metadata,
			Integrations:     input.Body.Integrations,
			StartLicenseDate: input.Body.StartLicenseDate,
			EndLicenseDate:   input.Body.EndLicenseDate,
			Slug:             slug,
		}

		instance, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: instance,
		}, nil
	})
}

// RegisterWebhook declares the InstanceCreated and InstanceDeployed webhook
// contracts in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(
		api,
		webhook.Declaration{
			Event:       events.InstanceCreated,
			Data:        (*schema.Instance)(nil),
			OperationID: "onInstanceCreated",
			Summary:     "Instance Created Webhook",
			Description: "Triggered when a new instance is created.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.InstanceDeployed,
			Data:        (*schema.Instance)(nil),
			OperationID: "onInstanceDeployed",
			Summary:     "Instance Deployed Webhook",
			Description: "Triggered when an instance is deployed to a deployment zone.",
			Tags:        []string{"webhooks", "instances"},
		},
	)
}
