package getentitlementusagemetrics

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	GetEntitlementUsage(
		ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug string,
	) (*schema.EntitlementUsage, error)
}

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Entitlement slug" example:"entitlement-slug"`
}

type Response struct {
	Body *schema.EntitlementUsage
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getEntitlementUsageMetrics",
		Method:      "GET",
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage",
		Summary:     "Get entitlement usage metrics for an instance",
		Description: "Retrieve the usage metrics for a specific entitlement in a given instance",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		entitlementsUsage, err := app.GetEntitlementUsage(
			ctx, cl, request.InstanceSlug, request.EntitlementSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: entitlementsUsage,
		}, nil
	})
}

// RegisterWebhook declares the EntitlementValueGet webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.EntitlementValueGet,
		Data:        (*InstanceEntitlementValueGet)(nil),
		OperationID: "onInstanceEntitlementValueGet",
		Summary:     "Instance Entitlement Value Read Webhook",
		Description: "Triggered on every read of an instance entitlement's usage value. This is a read audit signal, not a state change.",
		Tags:        []string{"webhooks", "instances"},
	})
}
