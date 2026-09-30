package deletecomponent

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

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	ComponentSlug string `path:"componentSlug" doc:"Component slug" example:"api-gateway-v1-2-3"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-component",
		Method:      http.MethodDelete,
		Path:        "/components/{componentSlug}",
		Summary:     "Delete a component",
		Description: "Delete a component by slug if it is not linked to any release.",
		Tags:        []string{"components"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Delete(ctx, cl, request.ComponentSlug); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

// RegisterWebhook declares the ComponentDeleted webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       componentevents.ComponentDeleted,
		Data:        (*componentschema.Component)(nil),
		OperationID: "onComponentDeleted",
		Summary:     "Component Deleted Webhook",
		Description: "Triggered when a component is deleted.",
		Tags:        []string{"webhooks", "components"},
	})
}
