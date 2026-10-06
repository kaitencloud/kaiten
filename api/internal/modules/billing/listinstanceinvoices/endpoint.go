package listinstanceinvoices

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListInstanceInvoices(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, params invoicelist.Params) (pagination.Page[invoices.InvoiceSummary], error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	invoicelist.Params
}

type Response struct {
	Body pagination.Page[invoices.InvoiceSummary]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listInstanceInvoices",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/invoices",
		Summary:     "List an instance's invoices",
		Description: "The invoices of one instance's subscription, across every time it was subscribed, with the filters of listInvoices. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		page, err := app.ListInstanceInvoices(ctx, cl, request.InstanceSlug, request.Params)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}
