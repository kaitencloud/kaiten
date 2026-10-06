package listaddonentitlements

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListEntitlements(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) ([]catalogue.AddonEntitlement, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
}

type Response struct {
	Body []catalogue.AddonEntitlement `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listAddonEntitlements",
		Method:      http.MethodGet,
		Path:        "/addons/{addonSlug}/entitlements",
		Summary:     "List an add-on version's grants",
		Description: "What one add-on version grants per unit of quantity. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListEntitlements(ctx, cl, request.AddonSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
