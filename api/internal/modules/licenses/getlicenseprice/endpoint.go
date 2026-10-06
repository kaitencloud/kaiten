package getlicenseprice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetPrice(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, priceID uuid.UUID) (*prices.Price, error)
}

type Request struct {
	LicenseSlug string    `path:"licenseSlug" doc:"License version slug" example:"pro-v2"`
	PriceID     uuid.UUID `path:"priceId" doc:"Price identifier"`
}

type Response struct {
	Body *prices.Price
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getLicensePrice",
		Method:      http.MethodGet,
		Path:        "/licenses/{licenseSlug}/prices/{priceId}",
		Summary:     "Get a license price",
		Description: "One price of a licence version. Requires billing to be enabled for the organization.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		price, err := app.GetPrice(ctx, cl, request.LicenseSlug, request.PriceID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: price}, nil
	})
}
