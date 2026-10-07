package listinstanceaddons

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListInstanceAddons(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, includeRemoved bool) ([]catalogue.InstanceAddon, error)
}

type Request struct {
	InstanceSlug   string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	IncludeRemoved bool   `query:"includeRemoved" doc:"Also list the add-ons removed from the instance"`
}

type Response struct {
	Body []catalogue.InstanceAddon `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listInstanceAddons",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/addons",
		Summary:     "List an instance's add-ons",
		Description: "The add-ons an instance holds, in attachment order, each with the prices its subscription bills. Requires billing to be enabled for the organization.",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListInstanceAddons(ctx, cl, request.InstanceSlug, request.IncludeRemoved)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
