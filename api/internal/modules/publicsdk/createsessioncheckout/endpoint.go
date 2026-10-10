package createsessioncheckout

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Checkouter is the one facade method this operation calls.
type Checkouter interface {
	CreateSessionCheckout(ctx context.Context, cl caller.CustomerSessionCaller, request SessionCheckoutOrder) (*SessionCheckout, error)
}

type Request struct {
	Body SessionCheckoutOrder
}

type Response struct {
	Status int
	Body   *SessionCheckout
}

func RegisterEndpoint(api huma.API, app Checkouter) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "createSessionCheckout",
		Method:      http.MethodPost,
		Path:        "/public/session/checkout",
		Summary:     "Check out",
		Description: "Subscribes the session's instance to a price of the public catalogue, with add-ons and a voucher, in one call. " +
			"With dryRun, answers 200 status=preview and what would be billed today, changing nothing. " +
			"When a payment method has to be saved first, answers 200 status=requires_payment_method with a setup page: send the customer there, " +
			"then call again with its setupSessionId. Otherwise answers 201 status=subscribed: the invoice of the first period has been pushed and charged, " +
			"and payment.status says how that went -- poll GET /public/session/invoices on processing or requires_action. " +
			"Needs a session bound to an instance.",
		Tags:          []string{"public"},
		Metadata:      kaitenhuma.AlsoResponds(http.StatusOK, "A preview (dryRun), or requires_payment_method with the hosted setup page: nothing was subscribed"),
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		checkout, err := app.CreateSessionCheckout(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		status := http.StatusOK
		if checkout.Status == StatusSubscribed {
			status = http.StatusCreated
		}
		return &Response{Status: status, Body: checkout}, nil
	})
}
