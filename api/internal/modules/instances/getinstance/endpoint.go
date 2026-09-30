package getinstance

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
	Get(
		ctx context.Context, cl caller.OrganizationCaller, slug string,
	) (*schema.Instance, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
}

type Response struct {
	Body *schema.Instance
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getInstance",
		Method:      "GET",
		Path:        "/instances/{instanceSlug}",
		Summary:     "Get an instance by slug",
		Description: "Retrieve an instance by their unique slug",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		instance, err := app.Get(ctx, cl, request.InstanceSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: instance,
		}, nil
	})
}
