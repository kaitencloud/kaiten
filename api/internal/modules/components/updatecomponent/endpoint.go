package updatecomponent

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	componentevents "github.com/kaitencloud/kaiten/api/internal/modules/components/events"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) (*componentschema.Component, error)
}

type Request struct {
	ComponentSlug string `path:"componentSlug" doc:"Component slug" example:"api-gateway-v1-2-3"`
	Body          componentschema.Component
}

type Response struct {
	Body *componentschema.Component
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-component",
		Method:      http.MethodPut,
		Path:        "/components/{componentSlug}",
		Summary:     "Update a component",
		Description: "Update a component in place when unlinked, or create a new version when it is already linked to releases.",
		Tags:        []string{"components"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.PreviousComponentID != nil {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateComponent.PreviousComponentNotSettable",
				"previousComponentId cannot be changed through this endpoint; it is set once, at creation",
			)
		}

		var slug *string
		if request.Body.Slug != "" {
			slug = &request.Body.Slug
		}

		command := &Command{
			Name:        request.Body.Name,
			Version:     request.Body.Version,
			Slug:        slug,
			Description: request.Body.Description,
		}

		component, err := app.Update(ctx, cl, request.ComponentSlug, command)
		if err != nil {
			return nil, err
		}

		return &Response{Body: component}, nil
	})
}

// RegisterWebhook declares the ComponentUpdated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       componentevents.ComponentUpdated,
		Data:        (*componentschema.Component)(nil),
		OperationID: "onComponentUpdated",
		Summary:     "Component Updated Webhook",
		Description: "Triggered when a component is updated or auto-versioned.",
		Tags:        []string{"webhooks", "components"},
	})
}
