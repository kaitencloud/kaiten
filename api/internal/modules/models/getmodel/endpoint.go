package getmodel

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Getter interface {
	Get(ctx context.Context, cl caller.OrganizationCaller, slug string) (*schema.Model, error)
}

type Request struct {
	ModelSlug string `path:"modelSlug"`
}

type Response struct{ Body *schema.Model }

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getModel", Method: http.MethodGet, Path: "/models/{modelSlug}",
		Summary: "Get a model", Tags: []string{"models"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		model, err := app.Get(ctx, cl, request.ModelSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: model}, nil
	})
}
