package deleterole

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Application interface {
	DeleteRole(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}
type Request struct {
	Slug string `path:"slug"`
}
type Response struct{}

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "DeleteRole", Method: http.MethodDelete, Path: "/roles/{slug}", Summary: "Delete an unassigned custom organization role",
		Description:   "Stored administrator capability required in the current organization. Built-in roles are immutable; custom roles group organization scopes.",
		DefaultStatus: http.StatusNoContent,
		Tags:          []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.DeleteRole(ctx, cl, request.Slug); err != nil {
			return nil, err
		}
		return &Response{}, nil
	})
}
