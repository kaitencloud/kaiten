package getintegration

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Resolver is the pair of facade methods this file's two operations call. Declared
// here rather than imported: internal/kaiten holds this use case, so naming it would
// close a cycle.
//
// Two methods on one interface because one use case backs two operations, each with
// its own scope. They are named for what they resolve to rather than for the lookup,
// which is what the facade namespace already says.
type Resolver interface {
	GetCustomer(
		ctx context.Context, cl caller.OrganizationCaller, adapter, externalID string,
	) (*integrationschema.CustomerIntegrationResource, error)
	GetInstance(
		ctx context.Context, cl caller.OrganizationCaller, adapter, externalID string,
	) (*integrationschema.InstanceIntegrationResource, error)
}

type GetCustomerRequest struct {
	Adapter    string `path:"adapter" doc:"Integration adapter without the kaiten.integration. prefix" example:"crm.attio"`
	ExternalID string `path:"externalId" doc:"External identifier in the third-party system" example:"rec_12345"`
}

type GetCustomerResponse struct {
	Body *integrationschema.CustomerIntegrationResource
}

type GetInstanceRequest struct {
	Adapter    string `path:"adapter" doc:"Integration adapter without the kaiten.integration. prefix" example:"crm.attio"`
	ExternalID string `path:"externalId" doc:"External identifier in the third-party system" example:"rec_12345"`
}

type GetInstanceResponse struct {
	Body *integrationschema.InstanceIntegrationResource
}

func RegisterEndpoint(api huma.API, app Resolver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-customer-integration-by-external-id",
		Method:      http.MethodGet,
		Path:        "/integration/{adapter}/customer/{externalId}",
		Summary:     "Get a customer by integration external ID",
		Description: "Resolve a customer through one of its integrations using adapter + external ID.",
		Tags:        []string{"integrations", "customers"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, CustomerRequiredScope, func(ctx context.Context, request *GetCustomerRequest) (*GetCustomerResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		resource, err := app.GetCustomer(ctx, cl, request.Adapter, request.ExternalID)
		if err != nil {
			return nil, err
		}
		return &GetCustomerResponse{Body: resource}, nil
	})

	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-instance-integration-by-external-id",
		Method:      http.MethodGet,
		Path:        "/integration/{adapter}/instance/{externalId}",
		Summary:     "Get an instance by integration external ID",
		Description: "Resolve an instance through one of its integrations using adapter + external ID.",
		Tags:        []string{"integrations", "instances"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, InstanceRequiredScope, func(ctx context.Context, request *GetInstanceRequest) (*GetInstanceResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		resource, err := app.GetInstance(ctx, cl, request.Adapter, request.ExternalID)
		if err != nil {
			return nil, err
		}
		return &GetInstanceResponse{Body: resource}, nil
	})
}
