package deprecatelicenseprice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deprecator is the one facade method this operation calls.
type Deprecator interface {
	DeprecatePrice(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, priceID uuid.UUID) (*prices.Price, error)
}

type Request struct {
	LicenseSlug string    `path:"licenseSlug" doc:"License version slug" example:"pro-v2"`
	PriceID     uuid.UUID `path:"priceId" doc:"Price identifier"`
}

type Response struct {
	Body *prices.Price
}

func RegisterEndpoint(api huma.API, app Deprecator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "deprecateLicensePrice",
		Method:      http.MethodPost,
		Path:        "/licenses/{licenseSlug}/prices/{priceId}/deprecate",
		Summary:     "Deprecate a license price",
		Description: "Retires a price from the catalogue: it keeps billing what is already pinned to it, is no longer offered, and stops being a default. Deprecation cannot be undone. Requires billing to be enabled for the organization.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		price, err := app.DeprecatePrice(ctx, cl, request.LicenseSlug, request.PriceID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: price}, nil
	})
}

// RegisterWebhook declares the LicensePriceDeprecated webhook contract.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicensePriceDeprecated,
		Data:        (*prices.LicensePriceEvent)(nil),
		OperationID: "onLicensePriceDeprecated",
		Summary:     "License Price Deprecated Webhook",
		Description: "Triggered when a licence price is deprecated.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
