package cancelplanchange

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Canceler is the one facade method this operation calls.
type Canceler interface {
	CancelPlanChange(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string) (*subscriptions.InstanceBilling, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
}

type Response struct {
	Body *subscriptions.InstanceBilling
}

func RegisterEndpoint(api huma.API, app Canceler) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "cancelPlanChange",
		Method:      http.MethodDelete,
		Path:        "/instances/{instanceSlug}/billing/scheduled-change",
		Summary:     "Cancel a scheduled plan change",
		Description: "Drops the plan change scheduled for the next boundary. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Metadata:    kaitenhuma.BoundaryPending(),
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		billing, err := app.CancelPlanChange(ctx, cl, request.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: billing}, nil
	})
}
