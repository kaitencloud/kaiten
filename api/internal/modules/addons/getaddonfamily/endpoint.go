package getaddonfamily

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetFamily(ctx context.Context, cl caller.OrganizationCaller, familySlug string) (*catalogue.AddonFamily, error)
}

type Request struct {
	FamilySlug string `path:"familySlug" doc:"Add-on family slug" example:"extra-seats"`
}

type Response struct {
	Body *catalogue.AddonFamily
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getAddonFamily",
		Method:      http.MethodGet,
		Path:        "/addon-families/{familySlug}",
		Summary:     "Get an add-on family",
		Description: "One add-on family with its versions and its current version. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.GetFamily(ctx, cl, request.FamilySlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
