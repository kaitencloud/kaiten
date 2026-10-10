package cancelsubscription

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Canceler is the one facade method this operation calls.
type Canceler interface {
	CancelSubscription(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, mode string, reason *string) (*CanceledSubscription, error)
}

// SubscriptionCancellation is how and why to cancel.
type SubscriptionCancellation struct {
	Mode   string  `json:"mode,omitempty" enum:"AT_PERIOD_END,IMMEDIATE" doc:"AT_PERIOD_END (the default): the period paid for runs out, then the FINAL invoice is issued. IMMEDIATE: the FINAL invoice is issued now, flat fees billed in full and nothing refunded."`
	Reason *string `json:"reason,omitempty" doc:"Up to 500 characters"`
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Body         SubscriptionCancellation
}

type Response struct {
	Body *CanceledSubscription
}

func RegisterEndpoint(api huma.API, app Canceler) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "cancelSubscription",
		Method:      http.MethodPost,
		Path:        "/instances/{instanceSlug}/billing/cancel",
		Summary:     "Cancel a subscription",
		Description: "Cancels an instance's subscription: a trial at once with no invoice; otherwise at the period's end (repeating it changes nothing), or immediately with a FINAL invoice. Cancellation changes billing only: entitlements and licence dates stay the vendor's to change. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Metadata:    kaitenhuma.BoundaryPending(),
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		canceled, err := app.CancelSubscription(ctx, cl, request.InstanceSlug, request.Body.Mode, request.Body.Reason)
		if err != nil {
			return nil, err
		}
		return &Response{Body: canceled}, nil
	})
}
