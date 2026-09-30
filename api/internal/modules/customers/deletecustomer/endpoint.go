package deletecustomer

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	Slug string `path:"customerSlug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-customer",
		Method:      http.MethodDelete,
		Path:        "/customers/{customerSlug}",
		Summary:     "Delete a customer",
		Description: "Delete a customer by their slug.",
		Tags:        []string{"customers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Delete(ctx, cl, request.Slug); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

// RegisterWebhook declares the CustomerDeleted webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.CustomerDeleted,
		Data:        (*schema.Customer)(nil),
		OperationID: "onCustomerDeleted",
		Summary:     "Customer Deleted Webhook",
		Description: "Triggered when a customer is deleted.",
		Tags:        []string{"webhooks", "customers"},
	})
}
