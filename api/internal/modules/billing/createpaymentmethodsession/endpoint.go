package createpaymentmethodsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreatePaymentMethodSession(ctx context.Context, cl caller.OrganizationCaller, customerSlug string, cmd NewPaymentMethodSession) (*PaymentMethodSession, error)
}

type Request struct {
	CustomerSlug string `path:"customerSlug" doc:"Customer slug"`
	Body         NewPaymentMethodSession
}

type Response struct {
	Body *PaymentMethodSession
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "createPaymentMethodSession",
		Method:      http.MethodPost,
		Path:        "/customers/{customerSlug}/billing/payment-method-session",
		Summary:     "Open a page saving a customer's payment method",
		Description: "Ensures the customer in the payment provider, then opens the provider's hosted page where the customer saves a payment method; Kaiten never sees card data. When the customer comes back to returnUrl, complete the session server-side. 404 .CustomerNotFound; 422 .ProviderNotConnected, .InvalidReturnUrl, .CurrencyRequired; 503 .ProviderUnavailable. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		out, err := app.CreatePaymentMethodSession(ctx, cl, request.CustomerSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: out}, nil
	})
}
