package setuserassignments

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Application interface {
	SetUserAssignments(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, input schema.UserRoleAssignments) (schema.UserAuthorization, error)
}
type Request struct {
	ID   uuid.UUID `path:"id" format:"uuid"`
	Body schema.UserRoleAssignments
}
type Response struct{ Body schema.UserAuthorization }

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "SetUserAssignments", Method: http.MethodPatch, Path: "/users/{id}/assignments", Summary: "Set user roles and direct scopes atomically",
		Description: "Requires a live human member with stored write:users who covers current and proposed permissions. Built-in roles are immutable but assignable within caller authority; the last enabled administrator is protected.",

		Tags: []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.SetUserAssignments(ctx, cl, request.ID, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
