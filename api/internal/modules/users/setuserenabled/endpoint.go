package setuserenabled

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
	SetUserEnabled(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, enabled bool) (schema.UserAuthorization, error)
}
type Request struct {
	ID   uuid.UUID `path:"id" format:"uuid"`
	Body schema.UserEnablement
}
type Response struct{ Body schema.UserAuthorization }

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "SetUserEnabled", Method: http.MethodPatch, Path: "/users/{id}/enabled", Summary: "Set user enabled state atomically",
		Description: "Stored administrator capability required in the current organization. Built-in roles are immutable; custom roles group organization scopes.",

		Tags: []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.SetUserEnabled(ctx, cl, request.ID, request.Body.Enabled)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
