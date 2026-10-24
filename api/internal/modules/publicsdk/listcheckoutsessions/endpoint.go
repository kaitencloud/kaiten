package listcheckoutsessions

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListCheckoutSessions(ctx context.Context, cl caller.OrganizationCaller, query Query) (pagination.Page[checkout.CheckoutSessionAdmin], error)
}

type Request struct {
	Status            []string `query:"status,explode" enum:"OPEN,AWAITING_PAYMENT,COMPLETED,ABANDONED,EXPIRED" doc:"Repeatable; a session OPEN past expiresAt is ABANDONED"`
	Email             string   `query:"email" doc:"The visitor's e-mail, in any letter case"`
	ClientReferenceID string   `query:"clientReferenceId" doc:"The vendor's own reference, exactly"`
	Cursor            string   `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit             int32    `query:"limit" minimum:"1" maximum:"200" doc:"Maximum number of entries to return (default 50, max 200)"`
}

type Response struct {
	Body pagination.Page[checkout.CheckoutSessionAdmin]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listCheckoutSessions",
		Method:      http.MethodGet,
		Path:        "/checkout-sessions",
		Summary:     "List checkout sessions",
		Description: "The organization's anonymous checkouts, newest first: how a vendor that missed or receives no checkout_session events links a buyer to its own account. " +
			"Never a ksc_ or a voucher code. Requires billing to be enabled for the organization. 400 CheckoutSessions.InvalidCursor.",
		Tags:   []string{"checkout-sessions"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		query := Query{Statuses: request.Status, Email: nil, ClientReferenceID: nil, Cursor: request.Cursor, Limit: request.Limit}
		if request.Email != "" {
			query.Email = &request.Email
		}
		if request.ClientReferenceID != "" {
			query.ClientReferenceID = &request.ClientReferenceID
		}
		page, err := app.ListCheckoutSessions(ctx, cl, query)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}
