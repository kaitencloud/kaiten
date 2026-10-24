package detachpaymentmethod

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Detacher is the one facade method this operation calls.
type Detacher interface {
	DetachPaymentMethod(ctx context.Context, cl caller.OrganizationCaller, customerSlug string) error
}

type Request struct {
	CustomerSlug string `path:"customerSlug" doc:"Customer slug"`
}

func RegisterEndpoint(api huma.API, app Detacher) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "detachPaymentMethod",
		Method:        http.MethodDelete,
		Path:          "/customers/{customerSlug}/billing/payment-method",
		Summary:       "Detach a customer's payment method",
		Description:   "Removes the customer's payment method from the payment provider. 409 .InUseByAutomaticCollection while a live subscription of the customer is charged automatically, .NoPaymentMethod; 503 .ProviderUnavailable. Requires billing to be enabled for the organization.",
		Tags:          []string{"billing"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		return nil, app.DetachPaymentMethod(ctx, cl, request.CustomerSlug)
	})
}
