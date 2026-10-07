package listsessioninvoices

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListSessionInvoices(ctx context.Context, cl caller.CustomerSessionCaller, cursor string, limit int32) (pagination.Page[sessions.SessionInvoice], error)
}

type Request struct {
	Cursor string `query:"cursor" doc:"Opaque cursor from the previous page's nextCursor"`
	Limit  int32  `query:"limit" minimum:"0" maximum:"200" doc:"Page size, 50 by default, 200 at most"`
}

type Response struct {
	Body pagination.Page[sessions.SessionInvoice]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "listSessionInvoices",
		Method:      http.MethodGet,
		Path:        "/public/session/invoices",
		Summary:     "List the customer's invoices",
		Description: "The session's customer's issued invoices -- its instance's, for a session bound to one -- newest first, with how to pay each. " +
			"An invoice still awaiting the outcome of its payment is read from the payment provider first, at most every 30 seconds: " +
			"poll this after a checkout answered processing or requires_action.",
		Tags:   []string{"public"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusTooManyRequests, http.StatusInternalServerError},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		page, err := app.ListSessionInvoices(ctx, cl, request.Cursor, request.Limit)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}
