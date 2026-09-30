package getentitlementsusagemetrics

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	ListEntitlementUsage(
		ctx context.Context, cl caller.OrganizationCaller, instanceSlug string,
	) ([]schema.EntitlementUsage, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
}

type Response struct {
	Body []schema.EntitlementUsage
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getEntitlementsUsageMetrics",
		Method:      "GET",
		Path:        "/instances/{instanceSlug}/entitlements/usage",
		Summary:     "List all entitlements usage metrics",
		Description: "Retrieve a list of all entitlements usage metrics for a specific instance",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		entitlementsUsage, err := app.ListEntitlementUsage(ctx, cl, request.InstanceSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: entitlementsUsage,
		}, nil
	})
}
