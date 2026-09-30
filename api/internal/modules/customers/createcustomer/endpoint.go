package createcustomer

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

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(ctx context.Context, cl caller.OrganizationCaller, cmd *Command) (*schema.Customer, error)
}

type Request struct {
	Body schema.Customer
}

type Response struct {
	Body *schema.Customer
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-customer",
		Method:        http.MethodPost,
		Path:          "/customers",
		Summary:       "Create a new customer",
		Description:   "Create a new customer with the provided details.",
		Tags:          []string{"customers"},
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
			Name:               request.Body.Name,
			ExternalCustomerID: request.Body.ExternalCustomerID,
			Domain:             request.Body.Domain,
			Slug:               slug,
			Integrations:       request.Body.Integrations,
		}

		customer, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}
		return &Response{
			Body: customer,
		}, nil
	})
}

// RegisterWebhook declares the CustomerCreated and CustomerCreationRejected
// webhook contracts in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(
		api,
		webhook.Declaration{
			Event:       events.CustomerCreated,
			Data:        (*schema.Customer)(nil),
			OperationID: "onCustomerCreated",
			Summary:     "Customer Created Webhook",
			Description: "Triggered when a new customer is created.",
			Tags:        []string{"webhooks", "customers"},
		},
		webhook.Declaration{
			Event:       events.CustomerCreationRejected,
			Data:        (*schema.CustomerCreationRejected)(nil),
			OperationID: "onCustomerCreationRejected",
			Summary:     "Customer Creation Rejected Webhook",
			Description: "Triggered when a customer creation is refused because the organization has reached its customer entitlement cap. No customer is created.",
			Tags:        []string{"webhooks", "customers"},
		},
	)
}
