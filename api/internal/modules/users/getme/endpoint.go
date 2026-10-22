package getme

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Application interface {
	GetMe(ctx context.Context, cl caller.OrganizationCaller) (schema.Me, error)
}
type (
	Request  struct{}
	Response struct{ Body schema.Me }
)

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "GetMe", Method: http.MethodGet, Path: "/me", Summary: "Read current user and effective authorization",
		Description: "Available to every active human member, including members with no assigned roles or permissions.",
		Tags:        []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.GetMe(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
