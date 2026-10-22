package listroles

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Application interface {
	ListRoles(ctx context.Context, cl caller.OrganizationCaller) ([]schema.Role, error)
}
type (
	Request  struct{}
	Response struct{ Body []schema.Role }
)

func RegisterEndpoint(api huma.API, app Application) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "ListRoles", Method: http.MethodGet, Path: "/roles", Summary: "List organization roles",
		Description: "Stored administrator capability required in the current organization. Built-in roles are immutable; custom roles group organization scopes.",

		Tags: []string{"users"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListRoles(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
