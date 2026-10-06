package getupcominginvoice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetUpcomingInvoice(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string) (*rating.InvoicePreview, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
}

type Response struct {
	Body *rating.InvoicePreview
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getUpcomingInvoice",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/billing/upcoming-invoice",
		Summary:     "Preview an instance's upcoming invoice",
		Description: "The invoice the subscription's next boundary will issue, composed from its usage so far, without writing anything: lines carry the period they will bill, quantities what was measured until now. wouldHold lists the meters whose usage journal fails a check and would hold the invoice. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		preview, err := app.GetUpcomingInvoice(ctx, cl, request.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: preview}, nil
	})
}
