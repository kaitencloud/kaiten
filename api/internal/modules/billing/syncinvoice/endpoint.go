package syncinvoice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Syncer is the one facade method this operation calls.
type Syncer interface {
	SyncInvoice(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID) (*invoices.Invoice, error)
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Syncer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "syncInvoice",
		Method:      http.MethodPost,
		Path:        "/invoices/{invoiceId}/sync",
		Summary:     "Sync an invoice with its provider",
		Description: "Reads an invoice from its payment provider now and applies what the provider says: its finalization, payment, write-off or void. Refused for an invoice not in a provider (409 SyncInvoice.NotPushed). Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.SyncInvoice(ctx, cl, request.InvoiceID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
