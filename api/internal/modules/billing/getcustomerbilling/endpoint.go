package getcustomerbilling

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls.
type Reader interface {
	GetCustomerBilling(ctx context.Context, cl caller.OrganizationCaller, customerSlug string) (*CustomerBilling, error)
}

type Request struct {
	CustomerSlug string `path:"customerSlug" doc:"Customer slug"`
}

type Response struct {
	Body *CustomerBilling
}

func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getCustomerBilling",
		Method:      http.MethodGet,
		Path:        "/customers/{customerSlug}/billing",
		Summary:     "Get a customer's billing",
		Description: "The customer's billing e-mail and its side in each payment provider: its id there and the labels of its default payment method (never card data). 404 GetCustomerBilling.CustomerNotFound. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		out, err := app.GetCustomerBilling(ctx, cl, request.CustomerSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: out}, nil
	})
}
