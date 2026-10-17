package listaddonprices

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
	ListPrices(ctx context.Context, cl caller.OrganizationCaller, addonSlug, status string) ([]prices.Price, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	Status    string `query:"status" enum:"ACTIVE,DEPRECATED" doc:"Only prices in this status; both when omitted"`
}

type Response struct {
	Body []prices.Price `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listAddonPrices",
		Method:      http.MethodGet,
		Path:        "/addons/{addonSlug}/prices",
		Summary:     "List an add-on version's prices",
		Description: "The prices of one add-on version, in display order. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListPrices(ctx, cl, request.AddonSlug, request.Status)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
