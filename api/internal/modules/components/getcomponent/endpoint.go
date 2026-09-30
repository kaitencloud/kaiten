package getcomponent

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(
		ctx context.Context, cl caller.OrganizationCaller, slug string,
	) (*componentschema.Component, error)
}

type Request struct {
	ComponentSlug string `path:"componentSlug" doc:"Component slug" example:"api-gateway-v1-2-3"`
}

type Response struct {
	Body *componentschema.Component
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-component",
		Method:      http.MethodGet,
		Path:        "/components/{componentSlug}",
		Summary:     "Get a component by slug",
		Description: "Returns a single component by its slug.",
		Tags:        []string{"components"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		component, err := app.Get(ctx, cl, request.ComponentSlug)
		if err != nil {
			return nil, err
		}

		return &Response{Body: component}, nil
	})
}
