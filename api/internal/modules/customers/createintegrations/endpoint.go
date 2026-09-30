package createintegrations

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	CreateIntegration(
		ctx context.Context, cl caller.OrganizationCaller,
		customerSlug, integrationName string, body schema.CustomerIntegration,
	) (*schema.CustomerIntegration, error)
}

type Request struct {
	CustomerSlug    string                     `path:"customerSlug" doc:"Customer slug" example:"acme-corp"`
	IntegrationName string                     `path:"integrationName" doc:"Integration adapter name" example:"kaiten.integration.crm.attio"`
	Body            schema.CustomerIntegration `doc:"Integration payload"`
}

type Response struct {
	Body *schema.CustomerIntegration
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-customer-integration",
		Method:        http.MethodPost,
		Path:          "/customers/{customerSlug}/integrations/{integrationName}",
		Summary:       "Create a customer integration",
		Description:   "Create a single integration for a customer",
		Tags:          []string{"customers"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		integration, err := app.CreateIntegration(ctx, cl, request.CustomerSlug, request.IntegrationName, request.Body)
		if err != nil {
			return nil, err
		}

		return &Response{Body: integration}, nil
	})
}
