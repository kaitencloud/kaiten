package createaddonprice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreatePrice(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, command NewAddonPrice) (*prices.Price, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	Body      NewAddonPrice
}

type Response struct {
	Body *prices.Price
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "createAddonPrice",
		Method:        http.MethodPost,
		Path:          "/addons/{addonSlug}/prices",
		Summary:       "Create an add-on price",
		Description:   "Adds a price to an add-on version, under the rules of a licence price. A price cannot change once created: create another and deprecate this one. Refused while an instance with a live subscription holds the version (409 CreateAddonPrice.BillingActive). Emits ADDON_PRICE_CREATED. Requires billing to be enabled for the organization.",
		Tags:          []string{"addons"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.CreatePrice(ctx, cl, request.AddonSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
