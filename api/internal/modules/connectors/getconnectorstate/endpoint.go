package getconnectorstate

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// StateReader is the one facade method this operation calls. Declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close a
// cycle.
type StateReader interface {
	GetState(
		ctx context.Context, cl caller.OrganizationCaller, name string,
	) (*schema.ConnectorState, error)
}

type Request struct {
	ConnectorName string `path:"connectorName" doc:"Stable connector name" example:"kaiten.integration.crm.attio"`
}

type Response struct {
	Body *schema.ConnectorState
}

// RegisterEndpoint publishes the organization-scoped view of one connector.
//
// It declares no 404. That is the point of the operation: a connector this deployment
// does not have answers 200 with available:false, because "not available" is one of
// the states the caller asked about rather than a failed lookup. The settings
// endpoint's 404 is what this replaces for that question.
func RegisterEndpoint(api huma.API, app StateReader) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-connector-state",
		Method:      http.MethodGet,
		Path:        "/connectors/{connectorName}/state",
		Summary:     "Get connector state for this organization",
		Description: "Returns whether the connector is registered in this deployment, whether the authenticated organization's licence includes it, and whether the organization has activated it. Answers 200 with `available: false` for a connector this deployment does not have.",
		Tags:        []string{"connectors"},
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden,
			http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		result, err := app.GetState(ctx, cl, request.ConnectorName)
		if err != nil {
			return nil, err
		}

		return &Response{Body: result}, nil
	})
}
