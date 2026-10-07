package publishaddon

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Publisher is the one facade method this operation calls.
type Publisher interface {
	PublishAddon(ctx context.Context, cl caller.OrganizationCaller, addonSlug string) (*catalogue.Addon, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"Add-on version slug" example:"extra-seats-v1"`
}

type Response struct {
	Body *catalogue.Addon
}

func RegisterEndpoint(api huma.API, app Publisher) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "publishAddon",
		Method:      http.MethodPost,
		Path:        "/addons/{addonSlug}/publish",
		Summary:     "Publish an add-on version",
		Description: "Puts a DRAFT version on sale (409 PublishAddon.NotADraft otherwise). Emits ADDON_PUBLISHED. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.PublishAddon(ctx, cl, request.AddonSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
