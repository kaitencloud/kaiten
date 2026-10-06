package getinvoice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetInvoice(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID) (*invoices.Invoice, error)
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getInvoice",
		Method:      http.MethodGet,
		Path:        "/invoices/{invoiceId}",
		Summary:     "Get an invoice",
		Description: "One invoice with its lines, the customer and instance as they were when it was composed, its hold and its handoff. Addressed by id at organization level: an invoice outlives its instance and customer. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.GetInvoice(ctx, cl, request.InvoiceID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
