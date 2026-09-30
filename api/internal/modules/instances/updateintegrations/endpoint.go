package updateintegrations

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	UpdateIntegration(
		ctx context.Context, cl caller.OrganizationCaller,
		instanceSlug, integrationName string, body schema.InstanceIntegration,
	) (*schema.InstanceIntegration, error)
}

type Request struct {
	InstanceSlug    string                     `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	IntegrationName string                     `path:"integrationName" doc:"Integration adapter name" example:"kaiten.integration.crm.attio"`
	Body            schema.InstanceIntegration `doc:"Integration payload"`
}

type Response struct {
	Body *schema.InstanceIntegration
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "update-instance-integration",
		Method:        http.MethodPut,
		Path:          "/instances/{instanceSlug}/integrations/{integrationName}",
		Summary:       "Update an instance integration",
		Description:   "Update a single integration for an instance",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusOK,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		integration, err := app.UpdateIntegration(
			ctx, cl, request.InstanceSlug, request.IntegrationName, request.Body)
		if err != nil {
			return nil, err
		}

		return &Response{Body: integration}, nil
	})
}
