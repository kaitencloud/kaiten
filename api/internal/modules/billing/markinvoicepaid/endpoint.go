package markinvoicepaid

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Marker is the one facade method this operation calls.
type Marker interface {
	MarkInvoicePaid(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, cmd Command) (*invoices.Invoice, error)
}

// InvoicePayment is a payment the organization records.
type InvoicePayment struct {
	PaidAt            *time.Time `json:"paidAt,omitempty" doc:"When it was paid, now or earlier; now when omitted"`
	ExternalReference *string    `json:"externalReference,omitempty" doc:"The invoice's number in the organization's accounting system, 1 to 255 characters. It also acknowledges an invoice still waiting in the handoff queue"`
	Note              *string    `json:"note,omitempty" maxLength:"1000" doc:"A note, such as the transfer's reference, kept only in the paid event"`
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
	Body      InvoicePayment
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Marker) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "markInvoicePaid",
		Method:      http.MethodPost,
		Path:        "/invoices/{invoiceId}/mark-paid",
		Summary:     "Mark an invoice paid",
		Description: "Records that a MANUAL invoice was paid. An invoice still waiting in the handoff queue is acknowledged by the same write. Marking it paid again with the same external reference answers it unchanged. An invoice a payment provider collects is settled there. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.MarkInvoicePaid(ctx, cl, request.InvoiceID, Command{PaidAt: request.Body.PaidAt, ExternalReference: request.Body.ExternalReference, Note: request.Body.Note})
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
