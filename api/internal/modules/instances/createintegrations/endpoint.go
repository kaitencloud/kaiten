package createintegrations

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	CreateIntegration(
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

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-instance-integration",
		Method:        http.MethodPost,
		Path:          "/instances/{instanceSlug}/integrations/{integrationName}",
		Summary:       "Create an instance integration",
		Description:   "Create a single integration for an instance",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		integration, err := app.CreateIntegration(
			ctx, cl, request.InstanceSlug, request.IntegrationName, request.Body)
		if err != nil {
			return nil, err
		}

		return &Response{Body: integration}, nil
	})
}
