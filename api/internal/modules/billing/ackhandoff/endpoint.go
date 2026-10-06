package ackhandoff

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Acknowledger is the one facade method this operation calls.
type Acknowledger interface {
	AckHandoff(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, cmd Command) (*invoices.Invoice, error)
}

// HandoffBooking is what an accounting system says when it booked an
// invoice.
type HandoffBooking struct {
	LeaseID           *uuid.UUID `json:"leaseId,omitempty" doc:"The claim's lease. When given, an invoice another claim took since is refused (AckHandoff.LeaseMismatch)"`
	ExternalReference *string    `json:"externalReference,omitempty" doc:"The invoice's number in the accounting system, 1 to 255 characters"`
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
	Body      HandoffBooking
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Acknowledger) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "ackHandoff",
		Method:      http.MethodPost,
		Path:        "/billing/handoff/{invoiceId}/ack",
		Summary:     "Acknowledge a handed-off invoice",
		Description: "Records that the organization's accounting system booked an invoice from the handoff queue. Safe to repeat: the same acknowledgement again, or one that adds a reference the invoice did not have, answers 200. Another reference than the one it was acknowledged under is refused (AckHandoff.ReferenceMismatch), which a consumer can take as already handed off. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.AckHandoff(ctx, cl, request.InvoiceID, Command{
			LeaseID: request.Body.LeaseID, ExternalReference: request.Body.ExternalReference,
		})
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
