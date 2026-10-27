package getcheckoutsessionadmin

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetCheckoutSessionAdmin(ctx context.Context, cl caller.OrganizationCaller, sessionID uuid.UUID) (*checkout.CheckoutSessionAdmin, error)
}

type Request struct {
	SessionID uuid.UUID `path:"sessionId"`
}

type Response struct {
	Body *checkout.CheckoutSessionAdmin
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getCheckoutSessionAdmin",
		Method:      http.MethodGet,
		Path:        "/checkout-sessions/{sessionId}",
		Summary:     "Get a checkout session",
		Description: "One anonymous checkout, as the vendor reads it. Never a ksc_ or a voucher code. Requires billing to be enabled for the organization. " +
			"404 GetCheckoutSessionAdmin.NotFound, also for a session deleted 90 days after it closed.",
		Tags:   []string{"checkout-sessions"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		session, err := app.GetCheckoutSessionAdmin(ctx, cl, request.SessionID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: session}, nil
	})
}
