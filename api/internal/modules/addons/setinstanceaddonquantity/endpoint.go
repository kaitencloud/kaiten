package setinstanceaddonquantity

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Setter is the one facade method this operation calls.
type Setter interface {
	SetInstanceAddonQuantity(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, addonSlug string, quantity int32) (*catalogue.InstanceAddon, error)
}

// AddonQuantity is how many units of an add-on an instance holds.
type AddonQuantity struct {
	Quantity int32 `json:"quantity" minimum:"1" example:"3"`
}
type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	AddonSlug    string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	Body         AddonQuantity
}

type Response struct {
	Body *catalogue.InstanceAddon
}

func RegisterEndpoint(api huma.API, app Setter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "setInstanceAddonQuantity",
		Method:      http.MethodPatch,
		Path:        "/instances/{instanceSlug}/addons/{addonSlug}",
		Summary:     "Change an instance add-on's quantity",
		Description: "Changes how many units of an add-on an instance holds. The entitlements follow at once; the next invoice bills the new quantity. Emits INSTANCE_ADDON_QUANTITY_CHANGED. Requires billing to be enabled for the organization.",
		Tags:        []string{"instances"},
		Metadata:    kaitenhuma.BoundaryPending(),
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.SetInstanceAddonQuantity(ctx, cl, request.InstanceSlug, request.AddonSlug, request.Body.Quantity)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
