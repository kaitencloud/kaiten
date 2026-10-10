package recomposeinvoice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Recomposer is the one facade method this operation calls.
type Recomposer interface {
	RecomposeInvoice(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID) (*Result, error)
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
}

type Response struct {
	Status int
	Body   *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Recomposer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "recomposeInvoice",
		Method:      http.MethodPost,
		Path:        "/invoices/{invoiceId}/recompose",
		Summary:     "Recompose an invoice",
		Description: "Composes an invoice again from the usage journal as it is now, keeping its BASE lines as they were sold. A held DRAFT is rewritten in place (200): issued when its journal is now sound, held again otherwise. A VOID invoice gets a replacement for the same boundary (201), under the subscription's current terms and billing e-mail. Any other invoice must be voided first. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Metadata:    kaitenhuma.AlsoResponds(http.StatusCreated, "The replacement of a VOID invoice, for the same boundary"),
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.RecomposeInvoice(ctx, cl, request.InvoiceID)
		if err != nil {
			return nil, err
		}
		status := http.StatusOK
		if result.Replaced {
			status = http.StatusCreated
		}
		return &Response{Status: status, Body: &result.Invoice}, nil
	})
}
