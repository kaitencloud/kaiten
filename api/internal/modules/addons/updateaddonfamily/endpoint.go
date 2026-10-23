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
	UpdateFamily(ctx context.Context, cl caller.OrganizationCaller, familySlug string, cmd Command) (*catalogue.AddonFamily, error)
}

// AddonFamilyVisibility is a family's settings to change; an absent member
// keeps the stored value.
type AddonFamilyVisibility struct {
	IsPublic        *bool   `json:"isPublic,omitempty" doc:"List the family's default PUBLISHED version, with its ACTIVE prices, in the public catalogue"`
	IncreaseBilling *string `json:"increaseBilling,omitempty" doc:"How a mid-period increase or attachment of the family's ADVANCE add-ons is billed, from the next composition: TRUE_UP (a true-up line for the elapsed period at the next renewal) or NEXT_BOUNDARY (from the next boundary only); another value answers 422 .InvalidIncreaseBilling"`
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
		Description: "Changes a family's own settings: whether the public catalogue lists it (families are private until made public), and how a mid-period increase of its ADVANCE add-ons is billed. An absent member keeps the stored value. Emits ADDON_UPDATED on each of its versions. Requires billing to be enabled for the organization. 404 .NotFound; 422 .InvalidIncreaseBilling.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.UpdateFamily(ctx, cl, request.FamilySlug, Command{IsPublic: request.Body.IsPublic, IncreaseBilling: request.Body.IncreaseBilling})
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
