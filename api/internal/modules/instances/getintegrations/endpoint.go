package getintegrations

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	GetIntegration(
		ctx context.Context, cl caller.OrganizationCaller, instanceSlug, integrationName string,
	) (*schema.InstanceIntegration, error)
}

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	IntegrationName string `path:"integrationName" doc:"Integration adapter name" example:"kaiten.integration.crm.attio"`
}

type Response struct {
	Body *schema.InstanceIntegration
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-instance-integration",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/integrations/{integrationName}",
		Summary:     "Get an instance integration",
		Description: "Retrieve a single integration for an instance",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		integration, err := app.GetIntegration(ctx, cl, request.InstanceSlug, request.IntegrationName)
		if err != nil {
			return nil, err
		}

		return &Response{Body: integration}, nil
	})
}
