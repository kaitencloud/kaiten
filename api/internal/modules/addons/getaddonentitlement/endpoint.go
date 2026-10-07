package getaddonentitlement

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
	GetEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug, entitlementSlug string) (*catalogue.AddonEntitlement, error)
}

type Request struct {
	AddonSlug       string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Entitlement slug" example:"seats"`
}

type Response struct {
	Body *catalogue.AddonEntitlement
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getAddonEntitlement",
		Method:      http.MethodGet,
		Path:        "/addons/{addonSlug}/entitlements/{entitlementSlug}",
		Summary:     "Get an add-on grant",
		Description: "One grant of an add-on version. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.GetEntitlement(ctx, cl, request.AddonSlug, request.EntitlementSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
