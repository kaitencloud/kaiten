package createcustomersession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreateCustomerSession(ctx context.Context, cl caller.OrganizationCaller, draft CustomerSessionDraft) (*CreatedCustomerSession, error)
}

type Request struct {
	Body CustomerSessionDraft
}

type Response struct {
	Body *CreatedCustomerSession
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "createCustomerSession",
		Method:      http.MethodPost,
		Path:        "/customer-sessions",
		Summary:     "Create a customer session",
		Description: "Mints a kst_ session for one of the organization's customers, optionally bound to one of its instances, for that customer's browser to call the /api/public/session routes: checkout, invoices. " +
			"Call it from your backend, where the customer is signed in, and hand the token to the page; mint a new one before it expires. " +
			"What the session writes is attributed to the caller. Limited to 50 sessions a second per organization.",
		Tags:          []string{"customer-sessions"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		created, err := app.CreateCustomerSession(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: created}, nil
	})
}
