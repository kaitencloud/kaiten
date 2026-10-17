package setaddoncompatibility

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Setter is the one facade method this operation calls.
type Setter interface {
	SetCompatibility(ctx context.Context, cl caller.OrganizationCaller, addonSlug, familySlug string) error
}

type Request struct {
	AddonSlug  string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	FamilySlug string `path:"familySlug" doc:"License family slug" example:"pro"`
}

func RegisterEndpoint(api huma.API, app Setter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "setAddonCompatibility",
		Method:        http.MethodPut,
		Path:          "/addons/{addonSlug}/compatible-license-families/{familySlug}",
		Summary:       "Make an add-on fit a licence family",
		Description:   "Lets instances on any version of the licence family attach this add-on version. Idempotent. Emits ADDON_UPDATED. Requires billing to be enabled for the organization.",
		Tags:          []string{"addons"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.SetCompatibility(ctx, cl, request.AddonSlug, request.FamilySlug); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})
}
