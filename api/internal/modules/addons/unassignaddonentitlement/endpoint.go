package unassignaddonentitlement

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Unassigner is the one facade method this operation calls.
type Unassigner interface {
	UnassignEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug, entitlementSlug string) error
}

type Request struct {
	AddonSlug       string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Entitlement slug" example:"seats"`
}

func RegisterEndpoint(api huma.API, app Unassigner) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "unassignAddonEntitlement",
		Method:        http.MethodDelete,
		Path:          "/addons/{addonSlug}/entitlements/{entitlementSlug}",
		Summary:       "Remove an add-on grant",
		Description:   "Removes a grant. Refused while an instance with a live subscription holds the version (409 UnassignAddonEntitlement.BillingActive) and while an ACTIVE price of the version meters it (409 UnassignAddonEntitlement.MeteredByPrice). Emits ADDON_ENTITLEMENT_UNASSIGNED. Requires billing to be enabled for the organization.",
		Tags:          []string{"addons"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.UnassignEntitlement(ctx, cl, request.AddonSlug, request.EntitlementSlug); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})
}
