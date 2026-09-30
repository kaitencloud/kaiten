package getserviceaccount

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(
		ctx context.Context, cl caller.OrganizationCaller, slug string,
	) (*schema.ServiceAccount, error)
}

type Request struct {
	ServiceAccountSlug string `path:"serviceAccountSlug" doc:"Service account slug" example:"service-account-slug"`
}

type Response struct {
	Body *schema.ServiceAccount `doc:"Service account details"`
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "get-service-account",
		Method:        http.MethodGet,
		Path:          "/service-accounts/{serviceAccountSlug}",
		Summary:       "Get a service account by slug",
		Description:   "Retrieve details of a specific service account (machine user) by its slug.",
		Tags:          []string{"service-accounts"},
		DefaultStatus: http.StatusOK,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		serviceAccount, err := app.Get(ctx, cl, request.ServiceAccountSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: serviceAccount,
		}, nil
	})
}
