package reactivatesubscription

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reactivator is the one facade method this operation calls.
type Reactivator interface {
	ReactivateSubscription(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string) (*subscriptions.InstanceBilling, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
}

type Response struct {
	Body *subscriptions.InstanceBilling
}

func RegisterEndpoint(api huma.API, app Reactivator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "reactivateSubscription",
		Method:      http.MethodPost,
		Path:        "/instances/{instanceSlug}/billing/reactivate",
		Summary:     "Reactivate a subscription",
		Description: "Reverts a cancellation scheduled for the period end, before it. A canceled subscription is subscribed again instead. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		billing, err := app.ReactivateSubscription(ctx, cl, request.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: billing}, nil
	})
}
