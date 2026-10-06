package listlicenseprices

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListPrices(ctx context.Context, cl caller.OrganizationCaller, licenseSlug, status, billingModel string) ([]prices.Price, error)
}

type Request struct {
	LicenseSlug  string `path:"licenseSlug" doc:"License version slug" example:"pro-v2"`
	Status       string `query:"status" enum:"ACTIVE,DEPRECATED" doc:"Only prices in this status; both when omitted"`
	BillingModel string `query:"billingModel" enum:"FLAT_FEE,USAGE_BASED,OVERAGE" doc:"Only prices of this billing model"`
}

type Response struct {
	Body []prices.Price `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listLicensePrices",
		Method:      http.MethodGet,
		Path:        "/licenses/{licenseSlug}/prices",
		Summary:     "List a license version's prices",
		Description: "The prices of one licence version, in display order. Requires billing to be enabled for the organization.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		items, err := app.ListPrices(ctx, cl, request.LicenseSlug, request.Status, request.BillingModel)
		if err != nil {
			return nil, err
		}
		return &Response{Body: items}, nil
	})
}
