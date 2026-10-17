package getbillinghealth

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls.
type Reader interface {
	GetHealth(ctx context.Context, cl caller.OrganizationCaller) (*BillingHealth, error)
}

type Request struct{}

type Response struct {
	Body *BillingHealth
}

func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getBillingHealth",
		Method:      http.MethodGet,
		Path:        "/billing/health",
		Summary:     "Get the billing health",
		Description: "What the organization's billing needs attention for, computed when read: periods waiting for their close, held invoices, invoices a payment provider keeps refusing, reconciliation mismatches, each provider's sync, overdue invoices and the handoff backlog. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		health, err := app.GetHealth(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: health}, nil
	})
}
