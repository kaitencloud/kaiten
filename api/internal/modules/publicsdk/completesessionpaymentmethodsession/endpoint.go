package completesessionpaymentmethodsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeCompleter is the one facade method this operation calls.
type FacadeCompleter interface {
	CompleteSessionPaymentMethodSession(ctx context.Context, cl caller.CustomerSessionCaller, setupSessionID string) (*completepaymentmethodsession.CompletedPaymentMethodSession, error)
}

type Request struct {
	SessionID string `path:"sessionId" minLength:"1" maxLength:"255" doc:"The setup session's id: the kaiten_setup_session the customer came back with"`
}

type Response struct {
	Body *completepaymentmethodsession.CompletedPaymentMethodSession
}

func RegisterEndpoint(api huma.API, app FacadeCompleter) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "completeSessionPaymentMethodSession",
		Method:      http.MethodPost,
		Path:        "/public/session/billing/payment-method-session/{sessionId}/complete",
		Summary:     "Complete a payment method page",
		Description: "Checks the setup session with the payment provider and makes its payment method the one the customer's invoices are charged to. " +
			"Safe to repeat. A session of another customer answers not found; one the customer has not completed, a conflict. " +
			"When the browser never comes back, the provider sync adopts the payment method within one interval.",
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
		completed, err := app.CompleteSessionPaymentMethodSession(ctx, cl, request.SessionID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: completed}, nil
	})
}
