package removeaddoncompatibility

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Remover is the one facade method this operation calls.
type Remover interface {
	RemoveCompatibility(ctx context.Context, cl caller.OrganizationCaller, addonSlug, familySlug string) error
}

type Request struct {
	AddonSlug  string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
	FamilySlug string `path:"familySlug" doc:"License family slug" example:"pro"`
}

func RegisterEndpoint(api huma.API, app Remover) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "removeAddonCompatibility",
		Method:        http.MethodDelete,
		Path:          "/addons/{addonSlug}/compatible-license-families/{familySlug}",
		Summary:       "Stop an add-on fitting a licence family",
		Description:   "Instances already holding the add-on keep it; no new attachment from the family. Idempotent. Emits ADDON_UPDATED. Requires billing to be enabled for the organization.",
		Tags:          []string{"addons"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.RemoveCompatibility(ctx, cl, request.AddonSlug, request.FamilySlug); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})
}
