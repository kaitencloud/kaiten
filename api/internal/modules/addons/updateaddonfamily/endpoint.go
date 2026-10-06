package updateaddonfamily

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdateFamily(ctx context.Context, cl caller.OrganizationCaller, familySlug string, isPublic bool) (*catalogue.AddonFamily, error)
}

// AddonFamilyVisibility is whether a family is listed publicly.
type AddonFamilyVisibility struct {
	IsPublic bool `json:"isPublic" doc:"List the family's default PUBLISHED version, with its ACTIVE prices, in the public catalogue"`
}
type Request struct {
	FamilySlug string `path:"familySlug" doc:"Add-on family slug" example:"extra-seats"`
	Body       AddonFamilyVisibility
}

type Response struct {
	Body *catalogue.AddonFamily
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateAddonFamily",
		Method:      http.MethodPatch,
		Path:        "/addon-families/{familySlug}",
		Summary:     "Update an add-on family",
		Description: "Lists the family in the public catalogue, or takes it out. Families are private until made public. Emits ADDON_UPDATED on each of its versions. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.UpdateFamily(ctx, cl, request.FamilySlug, request.Body.IsPublic)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
