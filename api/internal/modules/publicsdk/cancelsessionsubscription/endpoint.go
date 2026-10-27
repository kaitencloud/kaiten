package cancelsessionsubscription

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeCanceler is the one facade method this operation calls.
type FacadeCanceler interface {
	CancelSessionSubscription(ctx context.Context, cl caller.CustomerSessionCaller, request SessionCancellation) (*sessions.SessionSubscription, error)
}

type Request struct {
	Body SessionCancellation
}

type Response struct {
	Body *sessions.SessionSubscription
}

func RegisterEndpoint(api huma.API, app FacadeCanceler) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "cancelSessionSubscription",
		Method:      http.MethodPost,
		Path:        "/public/session/billing/cancel",
		Summary:     "Cancel the subscription at the period's end",
		Description: "Cancels the subscription of the session's instance at the end of the period paid for: it keeps billing and granting until then, and reactivating before then keeps it. " +
			"A trial ends at once, with nothing to pay. Repeating it changes nothing. 409 .NotActive when there is no live subscription, .BoundaryPending while the period that ended is being closed (Retry-After); 422 .InstanceRequired for a session bound to no instance.",
		Tags:     []string{"public"},
		Metadata: kaitenhuma.BoundaryPending(),
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict,
			http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		canceled, err := app.CancelSessionSubscription(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: canceled}, nil
	})
}
