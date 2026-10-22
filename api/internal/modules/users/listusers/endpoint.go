package listusers

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type Application interface {
	ListUsers(ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string) (pagination.Page[schema.ManagedUser], error)
}
type Request struct {
	Limit  int32  `query:"limit" default:"50" minimum:"1" maximum:"200"`
	Cursor string `query:"cursor"`
}
type Response struct {
	Body pagination.Page[schema.ManagedUser]
}

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "ListUsers", Method: http.MethodGet, Path: "/users", Summary: "List human users",
		Description: "Requires a live human member with stored read:users (write:users implies read). Provider authorization claims are ignored.",
		Tags:        []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		var cursor *string
		if request.Cursor != "" {
			cursor = &request.Cursor
		}
		result, err := app.ListUsers(ctx, cl, request.Limit, cursor)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
