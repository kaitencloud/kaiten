package voidinvoice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Voider is the one facade method this operation calls.
type Voider interface {
	VoidInvoice(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, reason string) (*invoices.Invoice, error)
}

// InvoiceVoid is why the invoice is voided.
type InvoiceVoid struct {
	Reason string `json:"reason" doc:"1 to 500 characters"`
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
	Body      InvoiceVoid
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Voider) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "voidInvoice",
		Method:      http.MethodPost,
		Path:        "/invoices/{invoiceId}/void",
		Summary:     "Void an invoice",
		Description: "Voids an invoice not yet settled -- a DRAFT, held or not, a MANUAL one, or one a payment provider issued -- which frees its boundary for a recompose. A provider's invoice is voided there first, and here only once the provider confirms (503 VoidInvoice.ProviderUnavailable leaves it unchanged); one the provider reports paid is refused. A paid or written-off invoice cannot be voided. A handoff still pending stays so, and its consumer sees the VOID. Voiding a VOID invoice again answers it unchanged. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.VoidInvoice(ctx, cl, request.InvoiceID, request.Body.Reason)
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
