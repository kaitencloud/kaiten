package attachinstanceaddon

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Attacher is the one facade method this operation calls.
type Attacher interface {
	AttachInstanceAddon(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, command NewInstanceAddon) (*catalogue.InstanceAddon, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Body         NewInstanceAddon
}

type Response struct {
	Body *catalogue.InstanceAddon
}

func RegisterEndpoint(api huma.API, app Attacher) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "attachInstanceAddon",
		Method:        http.MethodPost,
		Path:          "/instances/{instanceSlug}/addons",
		Summary:       "Attach an add-on to an instance",
		Description:   "Gives an instance an add-on version and a quantity. The entitlements apply at once; a subscription bills the quantity held at each boundary, without proration. One version per family: moving to another version is detach then attach. Emits INSTANCE_ADDON_ADDED. Requires billing to be enabled for the organization.",
		Tags:          []string{"instances"},
		Metadata:      kaitenhuma.BoundaryPending(),
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.AttachInstanceAddon(ctx, cl, request.InstanceSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
