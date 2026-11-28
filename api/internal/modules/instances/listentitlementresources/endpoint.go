package listentitlementresources

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	ListEntitlementResources(
		ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug string, limit int32, cursor *string,
	) (pagination.Page[schema.EntitlementResource], error)
}

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Slug of an entitlement whose limitScope is RESOURCE" example:"sources-per-competitor"`
	Cursor          string `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit           int32  `query:"limit" doc:"Maximum number of resources to return (default 50, max 200)" minimum:"1" maximum:"200"`
}

type Response struct {
	Body pagination.Page[schema.EntitlementResource]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listEntitlementResources",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/resources",
		Summary:     "List the resources that hold a counter for an entitlement",
		Description: "Returns a cursor-paginated page of the resources of an entitlement whose limitScope is RESOURCE that hold a counter on the instance, in resourceKey order (bytewise). Each carries its counter in the current usage window: zero when its last report was in a window that has since closed. The limit every one of them is measured against is the entitlement's own, read on getEntitlementUsageMetrics, with how many resources there are and how many have reached it. A resource a report has not created, or that was deleted, is not listed. The entitlement need not be granted to the instance any more: resources outlive a licence change. An entitlement whose limitScope is INSTANCE answers 422 ListEntitlementResources.NotPerResource.",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var cursor *string
		if request.Cursor != "" {
			cursor = &request.Cursor
		}
		page, err := app.ListEntitlementResources(ctx, cl, request.InstanceSlug, request.EntitlementSlug, request.Limit, cursor)
		if err != nil {
			return nil, err
		}

		return &Response{Body: page}, nil
	})
}
