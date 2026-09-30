package getintegrations

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
	GetIntegration(
		ctx context.Context, cl caller.OrganizationCaller, customerSlug, integrationName string,
	) (*schema.CustomerIntegration, error)
}

type Request struct {
	CustomerSlug    string `path:"customerSlug" doc:"Customer slug" example:"acme-corp"`
	IntegrationName string `path:"integrationName" doc:"Integration adapter name" example:"kaiten.integration.crm.attio"`
}

type Response struct {
	Body *schema.CustomerIntegration
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-customer-integration",
		Method:      http.MethodGet,
		Path:        "/customers/{customerSlug}/integrations/{integrationName}",
		Summary:     "Get a customer integration",
		Description: "Retrieve a single integration for a customer",
		Tags:        []string{"customers"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		integration, err := app.GetIntegration(ctx, cl, request.CustomerSlug, request.IntegrationName)
		if err != nil {
			return nil, err
		}

		return &Response{Body: integration}, nil
	})
}
