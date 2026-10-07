package listaddonfamilies

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
	ListFamilies(ctx context.Context, cl caller.OrganizationCaller) ([]catalogue.AddonFamily, error)
}

type Request struct{}

type Response struct {
	Body []catalogue.AddonFamily `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listAddonFamilies",
		Method:      http.MethodGet,
		Path:        "/addon-families",
		Summary:     "List add-on families",
		Description: "Every add-on family of the organization with its versions, newest family first. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListFamilies(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
