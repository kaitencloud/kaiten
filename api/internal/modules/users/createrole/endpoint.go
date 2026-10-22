package createrole

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Application interface {
	CreateRole(ctx context.Context, cl caller.OrganizationCaller, input schema.CreateRole) (schema.Role, error)
}
type (
	Request  struct{ Body schema.CreateRole }
	Response struct{ Body schema.Role }
)

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "CreateRole", Method: http.MethodPost, Path: "/roles", Summary: "Create a custom organization role",
		Description:   "Stored administrator capability required in the current organization. Built-in roles are immutable; custom roles group organization scopes.",
		DefaultStatus: http.StatusCreated,
		Tags:          []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.CreateRole(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
