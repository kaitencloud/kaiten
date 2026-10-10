package createsessionpaymentmethodsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeOpener is the one facade method this operation calls.
type FacadeOpener interface {
	CreateSessionPaymentMethodSession(ctx context.Context, cl caller.CustomerSessionCaller, request NewSessionPaymentMethodSession) (*createpaymentmethodsession.PaymentMethodSession, error)
}

type Request struct {
	Body NewSessionPaymentMethodSession
}

type Response struct {
	Body *createpaymentmethodsession.PaymentMethodSession
}

func RegisterEndpoint(api huma.API, app FacadeOpener) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "createSessionPaymentMethodSession",
		Method:      http.MethodPost,
		Path:        "/public/session/billing/payment-method-session",
		Summary:     "Open a page to save a payment method",
		Description: "Opens the payment provider's hosted page where the session's customer saves a payment method, for its invoices to be charged automatically. " +
			"Send the customer to url; when it comes back, with kaiten_setup_session in the query, complete the session. " +
			"Kaiten never sees card data.",
		Tags: []string{"public"},
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict,
			http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		opened, err := app.CreateSessionPaymentMethodSession(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: opened}, nil
	})
}
