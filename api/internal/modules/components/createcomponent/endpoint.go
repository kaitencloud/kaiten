package createcomponent

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	componentevents "github.com/kaitencloud/kaiten/api/internal/modules/components/events"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*componentschema.Component, error)
}

type Request struct {
	Body componentschema.Component
}

type Response struct {
	Body *componentschema.Component
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-component",
		Method:        http.MethodPost,
		Path:          "/components",
		Summary:       "Create a new component",
		Description:   "Create a new standalone component. Optionally derive it from a previous component version.",
		Tags:          []string{"components"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
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
			Name:                request.Body.Name,
			Version:             request.Body.Version,
			Slug:                slug,
			Description:         request.Body.Description,
			PreviousComponentID: request.Body.PreviousComponentID,
		}

		component, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}

		return &Response{Body: component}, nil
	})
}

// RegisterWebhook declares the ComponentCreated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       componentevents.ComponentCreated,
		Data:        (*componentschema.Component)(nil),
		OperationID: "onComponentCreated",
		Summary:     "Component Created Webhook",
		Description: "Triggered when a new component is created.",
		Tags:        []string{"webhooks", "components"},
	})
}
