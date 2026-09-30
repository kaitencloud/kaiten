package deleteinstance

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

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "deleteInstance",
		Method:      "DELETE",
		Path:        "/instances/{instanceSlug}",
		Summary:     "Delete an instance",
		Description: "Delete an instance with the provided slug",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, input *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Delete(ctx, cl, input.InstanceSlug); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the InstanceDeleted webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceDeleted,
		Data:        (*schema.Instance)(nil),
		OperationID: "onInstanceDeleted",
		Summary:     "Instance Deleted Webhook",
		Description: "Triggered when an instance is deleted.",
		Tags:        []string{"webhooks", "instances"},
	})
}
