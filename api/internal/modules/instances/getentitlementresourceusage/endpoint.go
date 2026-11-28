package getentitlementresourceusage

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	GetEntitlementResourceUsage(
		ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug, resourceKey string,
	) (*schema.EntitlementUsage, error)
}

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Slug of an entitlement whose limitScope is RESOURCE" example:"sources-per-competitor"`
	// ResourceKey carries no schema pattern or length, so that a malformed key
	// answers the documented GetEntitlementResourceUsage.InvalidResourceKey and
	// not Huma's generic 422.
	ResourceKey string `path:"resourceKey" doc:"The resource: the vendor's own identifier for the object, 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively, and neither . nor .. . It must contain no personal data: anyone who can read the instance can read it. Percent-escapes in the segment are decoded once. A key that does not match answers 422 GetEntitlementResourceUsage.InvalidResourceKey." example:"stigg"`
}

type Response struct {
	Body *schema.EntitlementUsage
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getEntitlementResourceUsageMetrics",
		Method:      "GET",
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/resources/{resourceKey}/usage",
		Summary:     "Get one resource's usage metrics for an instance",
		Description: "Retrieve one resource's usage against the limit of an entitlement whose limitScope is RESOURCE: value is the resource's counter in the current usage window, limit the entitlement's, and resourceKey names the resource. A resource nothing was reported for reads 0, so that a check before creating one works. The entitlement must be granted to the instance, as for getEntitlementUsageMetrics, which reads the entitlement's own usage: its highest counter. An entitlement whose limitScope is INSTANCE answers 422 GetEntitlementResourceUsage.NotPerResource.",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		usage, err := app.GetEntitlementResourceUsage(
			ctx, cl, request.InstanceSlug, request.EntitlementSlug, request.ResourceKey)
		if err != nil {
			return nil, err
		}

		return &Response{Body: usage}, nil
	})
}
