package deleteentitlementresource

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	DeleteEntitlementResource(
		ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug, resourceKey string,
	) error
}

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Slug of an entitlement whose limitScope is RESOURCE" example:"sources-per-competitor"`
	// ResourceKey carries no schema pattern or length, so that a malformed key
	// answers the documented DeleteEntitlementResource.InvalidResourceKey and
	// not Huma's generic 422.
	ResourceKey string `path:"resourceKey" doc:"The resource: the vendor's own identifier for the object, 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively, and neither . nor .. . It must contain no personal data: anyone who can read the instance can read it. Percent-escapes in the segment are decoded once. A key that does not match answers 422 DeleteEntitlementResource.InvalidResourceKey." example:"stigg"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "deleteEntitlementResource",
		Method:        http.MethodDelete,
		Path:          "/instances/{instanceSlug}/entitlements/{entitlementSlug}/resources/{resourceKey}",
		Summary:       "Forget one resource of an entitlement",
		Description:   "Forgets the counter of one resource of an entitlement whose limitScope is RESOURCE, when the object it counted for is deleted in the vendor's product: the resource no longer counts toward the ceiling of resources, and the entitlement's usage is its highest counter among the resources that are left. The resource's past reports stay in the usage history, which gains no row; an INSTANCE_ENTITLEMENT_RESOURCE_DELETED event announces the deletion. It answers 204 whether or not the resource held a counter, and then publishes nothing: deleting twice is safe. Reporting for the resource again starts a new counter at zero. The entitlement need not be granted to the instance any more. An entitlement whose limitScope is INSTANCE answers 422 DeleteEntitlementResource.NotPerResource.",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteEntitlementResource(ctx, cl, request.InstanceSlug, request.EntitlementSlug, request.ResourceKey); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the InstanceEntitlementResourceDeleted webhook
// contract in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceEntitlementResourceDeleted,
		Data:        (*InstanceEntitlementResourceDeleted)(nil),
		OperationID: "onInstanceEntitlementResourceDeleted",
		Summary:     "Instance Entitlement Resource Deleted Webhook",
		Description: "Triggered when the counter of one resource of an entitlement that counts per resource is deleted. It is not published when the resource held no counter.",
		Tags:        []string{"webhooks", "instances"},
	})
}
