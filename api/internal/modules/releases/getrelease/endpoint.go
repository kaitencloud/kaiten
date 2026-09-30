package getrelease

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(ctx context.Context, cl caller.OrganizationCaller, slug string) (*schema.Release, error)
}

type Request struct {
	ReleaseSlug string `path:"releaseSlug" doc:"Release slug" example:"release-slug"`
}

type Response struct {
	Body *schema.Release
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-release-by-slug",
		Method:      http.MethodGet,
		Path:        "/releases/{releaseSlug}",
		Summary:     "Get a release by slug",
		Description: "Returns a single release by their slug.",
		Tags:        []string{"deploymentZones"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		release, err := app.Get(ctx, cl, request.ReleaseSlug)
		if err != nil {
			return nil, err
		}
		return &Response{
			Body: release,
		}, nil
	})
}
