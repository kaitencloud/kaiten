package archiveaddon

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Archiver is the one facade method this operation calls.
type Archiver interface {
	ArchiveAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*catalogue.Addon, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
}

type Response struct {
	Body *catalogue.Addon
}

func RegisterEndpoint(api huma.API, app Archiver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "archiveAddon",
		Method:      http.MethodPost,
		Path:        "/addons/{addonSlug}/archive",
		Summary:     "Archive an add-on version",
		Description: "Withdraws a PUBLISHED version from sale: instances holding it keep it, none can attach it again (409 ArchiveAddon.NotPublished otherwise). Emits ADDON_ARCHIVED. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ArchiveAddon(ctx, cl, request.AddonSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
