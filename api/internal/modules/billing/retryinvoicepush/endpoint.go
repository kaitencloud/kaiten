package retryinvoicepush

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Retrier is the one facade method this operation calls.
type Retrier interface {
	RetryInvoicePush(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID) (*invoices.Invoice, error)
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Retrier) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "retryInvoicePush",
		Method:        http.MethodPost,
		Path:          "/invoices/{invoiceId}/retry-push",
		Summary:       "Retry pushing an invoice to its provider",
		Description:   "Puts a DRAFT or PUSH_FAILED invoice of a payment provider back in the push queue now, which resumes the push where its last attempt stopped. A draft waiting for finalization in its provider is finalized at once. Refused for a held invoice (409 RetryInvoicePush.Held) and for any other (409 RetryInvoicePush.InvalidStatus). Requires billing to be enabled for the organization.",
		Tags:          []string{"billing"},
		DefaultStatus: http.StatusAccepted,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.RetryInvoicePush(ctx, cl, request.InvoiceID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
