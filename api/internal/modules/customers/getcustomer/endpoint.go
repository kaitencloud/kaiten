package getcustomer

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(ctx context.Context, cl caller.OrganizationCaller, slug string) (*schema.Customer, error)
}

type Request struct {
	Slug string `path:"customerSlug"`
}

type Response struct {
	Body *schema.Customer
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-customer",
		Method:      http.MethodGet,
		Path:        "/customers/{customerSlug}",
		Summary:     "Get a customer by slug",
		Description: "Returns a single customer by their slug.",
		Tags:        []string{"customers"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		customer, err := app.Get(ctx, cl, request.Slug)
		if err != nil {
			return nil, err
		}
		return &Response{
			Body: customer,
		}, nil
	})
}
