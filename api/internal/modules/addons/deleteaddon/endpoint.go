package deleteaddon

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls.
type Deleter interface {
	DeleteAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) error
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "deleteAddon",
		Method:        http.MethodDelete,
		Path:          "/addons/{addonSlug}",
		Summary:       "Delete an add-on version",
		Description:   "Deletes a version that was never attached and grants nothing (409 DeleteAddon.InUseConflict otherwise); its family goes with its last version. Emits ADDON_DELETED. Requires billing to be enabled for the organization.",
		Tags:          []string{"addons"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.DeleteAddon(ctx, cl, request.AddonSlug); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})
}
