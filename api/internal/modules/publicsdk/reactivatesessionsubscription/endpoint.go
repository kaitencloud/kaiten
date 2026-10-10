package reactivatesessionsubscription

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeReactivator is the one facade method this operation calls.
type FacadeReactivator interface {
	ReactivateSessionSubscription(ctx context.Context, cl caller.CustomerSessionCaller) (*sessions.SessionSubscription, error)
}

type Response struct {
	Body *sessions.SessionSubscription
}

func RegisterEndpoint(api huma.API, app FacadeReactivator) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "reactivateSessionSubscription",
		Method:      http.MethodPost,
		Path:        "/public/session/billing/reactivate",
		Summary:     "Keep a subscription scheduled for cancellation",
		Description: "Takes back a cancellation scheduled for the period's end, before it: the subscription renews as before. " +
			"409 .NotScheduledForCancellation when none is scheduled (or the subscription has already ended), .BoundaryPending while the period that ended is being closed (Retry-After); 422 .InstanceRequired for a session bound to no instance.",
		Tags:     []string{"public"},
		Metadata: kaitenhuma.BoundaryPending(),
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict,
			http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, _ *struct{}) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		reactivated, err := app.ReactivateSessionSubscription(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: reactivated}, nil
	})
}
