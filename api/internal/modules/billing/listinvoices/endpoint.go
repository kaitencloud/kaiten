package listinvoices

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
	ListInvoices(ctx context.Context, cl caller.OrganizationCaller, params invoicelist.Params, instanceSlug string) (pagination.Page[invoices.InvoiceSummary], error)
}

type Request struct {
	invoicelist.Params
	InstanceSlug string `query:"instanceSlug" doc:"Only this instance's invoices: composed under this slug, or of the instance that has it now"`
}

type Response struct {
	Body pagination.Page[invoices.InvoiceSummary]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listInvoices",
		Method:      http.MethodGet,
		Path:        "/invoices",
		Summary:     "List invoices",
		Description: "The organization's invoices, newest first; with updatedSince, the ones changed since an instant, oldest change first, for incremental sync. Invoices outlive their instance and customer. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		page, err := app.ListInvoices(ctx, cl, request.Params, request.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}
