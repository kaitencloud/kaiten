package createportalsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreatePortalSession(ctx context.Context, cl caller.OrganizationCaller, customerSlug string, cmd PortalSessionRequest) (*PortalSession, error)
}

type Request struct {
	CustomerSlug string `path:"customerSlug" doc:"Customer slug"`
	Body         PortalSessionRequest
}

type Response struct {
	Body *PortalSession
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "createPortalSession",
		Method:      http.MethodPost,
		Path:        "/customers/{customerSlug}/billing/portal-session",
		Summary:     "Open a customer's billing portal",
		Description: "Opens the payment provider's hosted portal for the customer, where it manages payment methods and invoices; changes reach Kaiten through sync. 422 .ProviderNotConnected, .CustomerNotOnProvider, .InvalidReturnUrl; 503 .ProviderUnavailable. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		out, err := app.CreatePortalSession(ctx, cl, request.CustomerSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: out}, nil
	})
}
