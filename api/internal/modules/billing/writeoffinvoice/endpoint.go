package writeoffinvoice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// WriterOff is the one facade method this operation calls.
type WriterOff interface {
	WriteOffInvoice(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, reason string) (*invoices.Invoice, error)
}

// InvoiceWriteOff is why the invoice is written off.
type InvoiceWriteOff struct {
	Reason string `json:"reason,omitempty" doc:"1 to 500 characters; .ReasonRequired otherwise"`
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
	Body      InvoiceWriteOff
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app WriterOff) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "writeOffInvoice",
		Method:      http.MethodPost,
		Path:        "/invoices/{invoiceId}/write-off",
		Summary:     "Write off an invoice",
		Description: "Records that the organization gave up collecting a MANUAL invoice: it becomes UNCOLLECTIBLE. A handoff still pending stays so, and its consumer sees the new status. Writing off an UNCOLLECTIBLE invoice again answers it unchanged. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.WriteOffInvoice(ctx, cl, request.InvoiceID, request.Body.Reason)
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
