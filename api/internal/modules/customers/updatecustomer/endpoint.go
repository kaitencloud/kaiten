package updatecustomer

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
//
// The updated customer is returned and this endpoint discards it -- the operation
// publishes no response body -- but the method is named as the use case defines it
// rather than narrowed to fit one caller. A second driver that wants the row should
// not have to widen the facade to get it.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) (*schema.Customer, error)
}

type Request struct {
	Slug string `path:"customerSlug"`
	Body schema.Customer
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-customer",
		Method:      http.MethodPut,
		Path:        "/customers/{customerSlug}",
		Summary:     "Update a customer",
		Description: "Update a customer's details. Slug and integrations are not renameable/settable through this endpoint -- omit them, or send the values already on record.",
		Tags:        []string{"customers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		// Customer is shared with create-customer and get-customer, so the wire
		// schema structurally allows slug/integrations here even though this
		// endpoint supports changing neither. Rejected explicitly rather than
		// silently ignored.
		if request.Body.Slug != "" && request.Body.Slug != request.Slug {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateCustomer.SlugNotRenameable",
				"slug cannot be changed through this endpoint; omit it or send the current slug",
			)
		}
		if len(request.Body.Integrations) > 0 {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateCustomer.IntegrationsNotSettable",
				"integrations cannot be set through this endpoint; use the dedicated integration endpoints",
			)
		}

		command := &Command{
			Name:               request.Body.Name,
			ExternalCustomerID: request.Body.ExternalCustomerID,
			Domain:             request.Body.Domain,
			BillingEmail:       request.Body.BillingEmail,
		}
		if _, err := app.Update(ctx, cl, request.Slug, command); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

// RegisterWebhook declares the CustomerUpdated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.CustomerUpdated,
		Data:        (*schema.Customer)(nil),
		OperationID: "onCustomerUpdated",
		Summary:     "Customer Updated Webhook",
		Description: "Triggered when a customer is updated.",
		Tags:        []string{"webhooks", "customers"},
	})
}
