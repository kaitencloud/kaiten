package getuser

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
	GetUser(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID) (schema.ManagedUser, error)
}
type Request struct {
	ID uuid.UUID `path:"id" format:"uuid"`
}
type Response struct{ Body schema.ManagedUser }

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "GetUser", Method: http.MethodGet, Path: "/users/{id}", Summary: "Get a human user",
		Description: "Administrator role required in the current organization; provider authorization claims are ignored.",
		Tags:        []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.GetUser(ctx, cl, request.ID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
