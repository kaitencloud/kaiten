package getbillingcapabilities

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetCapabilities(ctx context.Context, cl caller.OrganizationCaller) (*BillingCapabilities, error)
}

type Response struct {
	Body *BillingCapabilities
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getBillingCapabilities",
		Method:      http.MethodGet,
		Path:        "/billing/capabilities",
		Summary:     "Get billing capabilities",
		Description: "Whether billing is enabled for the organization, and if not why; who can collect its invoices; and which parts of billing this release ships, so a client shows only what works. Answers even when billing is disabled.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, _ *struct{}) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		capabilities, err := app.GetCapabilities(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: capabilities}, nil
	})
}
