package updaterole

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Application interface {
	UpdateRole(ctx context.Context, cl caller.OrganizationCaller, slug string, input schema.RoleDefinition) (schema.Role, error)
}
type Request struct {
	Slug string `path:"slug"`
	Body schema.RoleDefinition
}
type Response struct{ Body schema.Role }

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "UpdateRole", Method: http.MethodPut, Path: "/roles/{slug}", Summary: "Replace a custom organization role",
		Description: "Requires a live human member with stored write:users who covers current and proposed permissions. Built-in roles are immutable but assignable within caller authority; the last enabled administrator is protected.",

		Tags: []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.UpdateRole(ctx, cl, request.Slug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
