package listaddons

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
	ListAddons(ctx context.Context, cl caller.OrganizationCaller, lifecycleState, familySlug string) ([]catalogue.Addon, error)
}

type Request struct {
	LifecycleState string `query:"lifecycleState" enum:"DRAFT,PUBLISHED,ARCHIVED" doc:"Only versions in this state"`
	FamilySlug     string `query:"familySlug" doc:"Only versions of this family"`
}

type Response struct {
	Body []catalogue.Addon `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listAddons",
		Method:      http.MethodGet,
		Path:        "/addons",
		Summary:     "List add-on versions",
		Description: "The organization's add-on versions, newest first. Requires billing to be enabled for the organization.",
		Tags:        []string{"addons"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListAddons(ctx, cl, request.LifecycleState, request.FamilySlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
