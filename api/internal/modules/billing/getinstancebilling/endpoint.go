package getinstancebilling

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetInstanceBilling(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string) (*subscriptions.InstanceBilling, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
}

type Response struct {
	Body *subscriptions.InstanceBilling
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getInstanceBilling",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/billing",
		Summary:     "Get an instance's subscription",
		Description: "The instance's subscription, live or CANCELED; 404 when it was never subscribed. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		billing, err := app.GetInstanceBilling(ctx, cl, request.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: billing}, nil
	})
}
