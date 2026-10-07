package updateaddon

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
	UpdateAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string, command AddonChanges) (*catalogue.Addon, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	Body      AddonChanges
}

type Response struct {
	Body *catalogue.Addon
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateAddon",
		Method:      http.MethodPut,
		Path:        "/addons/{addonSlug}",
		Summary:     "Update an add-on version",
		Description: "Replaces a version's name, description, version name, default flag and maximum quantity. Emits ADDON_UPDATED. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.UpdateAddon(ctx, cl, request.AddonSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
