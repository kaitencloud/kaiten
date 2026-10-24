package deprecateaddonprice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deprecator is the one facade method this operation calls.
type Deprecator interface {
	DeprecatePrice(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, priceID uuid.UUID) (*prices.Price, error)
}

type Request struct {
	AddonSlug string    `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	PriceID   uuid.UUID `path:"priceId" doc:"Price id"`
}

type Response struct {
	Body *prices.Price
}

func RegisterEndpoint(api huma.API, app Deprecator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "deprecateAddonPrice",
		Method:      http.MethodPost,
		Path:        "/addons/{addonSlug}/prices/{priceId}/deprecate",
		Summary:     "Deprecate an add-on price",
		Description: "Stops offering a price. A default price cannot be deprecated (409 DeprecateAddonPrice.IsDefault): it is what bills every instance holding the version; retire it through a new version. Emits ADDON_PRICE_DEPRECATED. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.DeprecatePrice(ctx, cl, request.AddonSlug, request.PriceID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
