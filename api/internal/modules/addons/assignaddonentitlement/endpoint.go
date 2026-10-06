package assignaddonentitlement

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Assigner is the one facade method this operation calls.
type Assigner interface {
	AssignEntitlement(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, command NewAddonGrant) (*catalogue.AddonEntitlement, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	Body      NewAddonGrant
}

type Response struct {
	Body *catalogue.AddonEntitlement
}

func RegisterEndpoint(api huma.API, app Assigner) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "assignAddonEntitlement",
		Method:        http.MethodPost,
		Path:          "/addons/{addonSlug}/entitlements",
		Summary:       "Grant an entitlement through an add-on",
		Description:   "Grants an entitlement per unit of an add-on version. Refused while an instance with a live subscription holds the version (409 AssignAddonEntitlement.BillingActive). Emits ADDON_ENTITLEMENT_ASSIGNED. Requires billing to be enabled for the organization.",
		Tags:          []string{"addons"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.AssignEntitlement(ctx, cl, request.AddonSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
