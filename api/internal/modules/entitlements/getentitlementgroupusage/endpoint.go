package getentitlementgroupusage

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	GetGroupUsage(
		ctx context.Context, cl caller.OrganizationCaller, groupSlug, instanceSlug string,
	) ([]*schema.EntitlementGroupUsage, error)
}

// Request represents the HTTP request for getting entitlement group usage.
type Request struct {
	GroupSlug    string `path:"entitlementGroupSlug"`
	InstanceSlug string `query:"instance" required:"true" doc:"Instance slug to get usage for"`
}

// Response represents the HTTP response body for entitlement group usage.
type Response struct {
	Body []*schema.EntitlementGroupUsage
}

// RegisterEndpoint registers the HTTP endpoint for getting entitlement group usage.
func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-entitlement-group-usage",
		Method:      http.MethodGet,
		Path:        "/entitlement-groups/{entitlementGroupSlug}/usage",
		Summary:     "Get aggregated usage for an entitlement group",
		Description: "Retrieve the aggregated usage metrics of all member entitlements for a given instance",
		Tags:        []string{"entitlement-groups"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		items, err := app.GetGroupUsage(ctx, cl, request.GroupSlug, request.InstanceSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: items,
		}, nil
	})
}
