package updateintegrations

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	UpdateIntegration(
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

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "update-customer-integration",
		Method:        http.MethodPut,
		Path:          "/customers/{customerSlug}/integrations/{integrationName}",
		Summary:       "Update a customer integration",
		Description:   "Update a single integration for a customer",
		Tags:          []string{"customers"},
		DefaultStatus: http.StatusOK,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		integration, err := app.UpdateIntegration(ctx, cl, request.CustomerSlug, request.IntegrationName, request.Body)
		if err != nil {
			return nil, err
		}

		return &Response{Body: integration}, nil
	})
}
