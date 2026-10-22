package updateuser

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
	UpdateUser(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, profile schema.Profile) error
}
type Request struct {
	ID   uuid.UUID `path:"id" format:"uuid"`
	Body schema.Profile
}

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "UpdateUser", Method: http.MethodPut, Path: "/users/{id}", Summary: "Update a human profile",
		Description: "Requires a live human member with stored write:users who covers the target's current authority. Profile name and email are global across memberships and become locally managed.",
		Tags:        []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
		DefaultStatus: http.StatusNoContent,
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.UpdateUser(ctx, cl, request.ID, request.Body); err != nil {
			return nil, err
		}
		return nil, nil
	})
}
