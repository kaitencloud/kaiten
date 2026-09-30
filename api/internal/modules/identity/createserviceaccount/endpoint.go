package createserviceaccount

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller, name string, slug *string,
	) (*schema.ServiceAccount, error)
}

type Request struct {
	Body schema.ServiceAccount `doc:"Service account details"`
}

type Response struct {
	Body *schema.ServiceAccount `doc:"Created service account"`
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-service-account",
		Method:        http.MethodPost,
		Path:          "/service-accounts",
		Summary:       "Create a new service account",
		Description:   "Create a new service account (machine user) with the provided name. Service accounts can be used to generate API tokens for programmatic access.",
		Tags:          []string{"service-accounts"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var slug *string
		if request.Body.Slug != "" {
			slug = &request.Body.Slug
		}
		serviceAccount, err := app.Create(ctx, cl, request.Body.Name, slug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: serviceAccount,
		}, nil
	})
}
