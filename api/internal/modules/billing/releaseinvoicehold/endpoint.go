package releaseinvoicehold

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Releaser is the one facade method this operation calls.
type Releaser interface {
	ReleaseInvoiceHold(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, reason string) (*invoices.Invoice, error)
}

// HoldRelease is why the invoice is released despite its journal.
type HoldRelease struct {
	Reason string `json:"reason,omitempty" doc:"1 to 500 characters; .ReasonRequired otherwise"`
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
	Body      HoldRelease
}

type Response struct {
	Body *invoices.Invoice
}

func RegisterEndpoint(api huma.API, app Releaser) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "releaseInvoiceHold",
		Method:      http.MethodPost,
		Path:        "/invoices/{invoiceId}/release-hold",
		Summary:     "Release a held invoice",
		Description: "Accepts a held invoice as composed and issues it: MANUAL and pending in the handoff queue, or PAID when nothing is owed. The release keeps who released it and why. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		invoice, err := app.ReleaseInvoiceHold(ctx, cl, request.InvoiceID, request.Body.Reason)
		if err != nil {
			return nil, err
		}
		return &Response{Body: invoice}, nil
	})
}
