package listaddoncompatibility

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListCompatibility(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*CompatibleLicenseFamilies, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
}

type Response struct {
	Body *CompatibleLicenseFamilies
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listAddonCompatibility",
		Method:      http.MethodGet,
		Path:        "/addons/{addonSlug}/compatible-license-families",
		Summary:     "List the licence families an add-on fits",
		Description: "The licence families an instance must be on to attach this add-on version. None: it cannot be attached. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListCompatibility(ctx, cl, request.AddonSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
