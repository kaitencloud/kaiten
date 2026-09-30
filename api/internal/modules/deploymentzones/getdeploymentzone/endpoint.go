package getdeploymentzone

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(
		ctx context.Context, cl caller.OrganizationCaller, slug string,
	) (*schema.DeploymentZone, error)
}

type Request struct {
	Slug string `path:"deploymentZoneSlug"`
}

type Response struct {
	Body *schema.DeploymentZone
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-deployment-zone-by-slug",
		Method:      http.MethodGet,
		Path:        "/deployment-zones/{deploymentZoneSlug}",
		Summary:     "Get a deployment zone by slug",
		Description: "Returns a single deployment zone by their slug.",
		Tags:        []string{"deploymentZones"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		deploymentZone, err := app.Get(ctx, cl, request.Slug)
		if err != nil {
			return nil, err
		}
		return &Response{
			Body: deploymentZone,
		}, nil
	})
}
