package getentitlementgroup

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
	GetGroup(
		ctx context.Context, cl caller.OrganizationCaller, slug string,
	) (*schema.EntitlementGroup, error)
}

// Request represents the HTTP request for getting an entitlement group.
type Request struct {
	Slug string `path:"entitlementGroupSlug"`
}

// Response represents the HTTP response body for getting an entitlement group.
type Response struct {
	Body *schema.EntitlementGroup
}

// RegisterEndpoint registers the HTTP endpoint for getting an entitlement group.
func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-entitlement-group",
		Method:      http.MethodGet,
		Path:        "/entitlement-groups/{entitlementGroupSlug}",
		Summary:     "Get entitlement group by slug",
		Description: "Retrieve details of a specific entitlement group by its slug",
		Tags:        []string{"entitlement-groups"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		group, err := app.GetGroup(ctx, cl, request.Slug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: group,
		}, nil
	})
}
