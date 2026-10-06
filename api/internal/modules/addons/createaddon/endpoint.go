package createaddon

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreateAddon(ctx context.Context, cl caller.OrganizationCaller, command NewAddon) (*catalogue.Addon, error)
}

type Request struct {
	Body NewAddon
}

type Response struct {
	Body *catalogue.Addon
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "createAddon",
		Method:        http.MethodPost,
		Path:          "/addons",
		Summary:       "Create an add-on version",
		Description:   "Creates an add-on version: the first of a new family, or the next version of the family familySlug (or familyId) names. Emits ADDON_CREATED. Requires billing to be enabled for the organization.",
		Tags:          []string{"addons"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.CreateAddon(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
