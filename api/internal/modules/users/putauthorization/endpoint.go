package putauthorization

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
	PutUserAuthorization(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, assignment schema.UserAuthorization) (schema.UserAuthorization, error)
}
type Request struct {
	ID   uuid.UUID `path:"id" format:"uuid"`
	Body schema.UserAuthorization
}
type Response struct{ Body schema.UserAuthorization }

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "PutUserAuthorization", Method: http.MethodPut, Path: "/users/{id}/authorization", Summary: "Replace user roles, permissions and enabled state",
		Description: "Administrator role required in the current organization; provider authorization claims are ignored.",
		Tags:        []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.PutUserAuthorization(ctx, cl, request.ID, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
