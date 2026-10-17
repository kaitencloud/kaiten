package updateaddonentitlement

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
	UpdateEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug, entitlementSlug string, command AddonGrantChanges) (*catalogue.AddonEntitlement, error)
}

type Request struct {
	AddonSlug       string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Entitlement slug" example:"seats"`
	Body            AddonGrantChanges
}

type Response struct {
	Body *catalogue.AddonEntitlement
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateAddonEntitlement",
		Method:      http.MethodPut,
		Path:        "/addons/{addonSlug}/entitlements/{entitlementSlug}",
		Summary:     "Update an add-on grant",
		Description: "Replaces a grant's value, override behaviour and overage. Refused while an instance with a live subscription holds the version (409 UpdateAddonEntitlement.BillingActive). Emits ADDON_ENTITLEMENT_UPDATED. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.UpdateEntitlement(ctx, cl, request.AddonSlug, request.EntitlementSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
