package detachinstanceaddon

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Detacher is the one facade method this operation calls.
type Detacher interface {
	DetachInstanceAddon(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, addonSlug string) error
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	AddonSlug    string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
}

func RegisterEndpoint(api huma.API, app Detacher) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "detachInstanceAddon",
		Method:        http.MethodDelete,
		Path:          "/instances/{instanceSlug}/addons/{addonSlug}",
		Summary:       "Remove an add-on from an instance",
		Description:   "Removes an add-on from an instance. The entitlements drop at once; nothing is refunded. The attachment stays readable with includeRemoved. Emits INSTANCE_ADDON_REMOVED. Requires billing to be enabled for the organization.",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.DetachInstanceAddon(ctx, cl, request.InstanceSlug, request.AddonSlug); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})
}
