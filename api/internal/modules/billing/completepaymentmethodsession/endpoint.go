package completepaymentmethodsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Completer is the one facade method this operation calls.
type Completer interface {
	CompletePaymentMethodSession(ctx context.Context, cl caller.OrganizationCaller, customerSlug, sessionID string) (*CompletedPaymentMethodSession, error)
}

type Request struct {
	CustomerSlug string `path:"customerSlug" doc:"Customer slug"`
	SessionID    string `path:"sessionId" doc:"The setup session id the customer came back with"`
}

type Response struct {
	Body *CompletedPaymentMethodSession
}

func RegisterEndpoint(api huma.API, app Completer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "completePaymentMethodSession",
		Method:      http.MethodPost,
		Path:        "/customers/{customerSlug}/billing/payment-method-session/{sessionId}/complete",
		Summary:     "Complete a payment-method session",
		Description: "Checks the setup session with the payment provider (the redirect is never trusted) and makes the payment method saved there the one the customer's invoices are charged to. Idempotent. 404 .SessionNotFound (unknown, or another customer's); 409 .SessionNotComplete; 503 .ProviderUnavailable. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		out, err := app.CompletePaymentMethodSession(ctx, cl, request.CustomerSlug, request.SessionID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: out}, nil
	})
}
