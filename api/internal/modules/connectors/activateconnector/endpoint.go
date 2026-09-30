package activateconnector

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Activator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Activator interface {
	Activate(
		ctx context.Context, cl caller.OrganizationCaller, name string,
	) (*schema.ConnectorActivation, error)
}

type Request struct {
	ConnectorName string `path:"connectorName" doc:"Stable connector name" example:"kaiten.integration.crm.attio"`
}

type Response struct {
	Body *schema.ConnectorActivation
}

// RegisterEndpoint publishes activation as a PUT on a sub-resource of the connector.
//
// PUT rather than POST because it is idempotent and names the thing it creates: the
// activation for this organization and this connector is one addressable state, and
// asking for it twice leaves the same state. DELETE on the same path turns it off,
// which is what makes the pair read as one switch rather than two commands.
func RegisterEndpoint(api huma.API, app Activator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "activate-connector",
		Method:      http.MethodPut,
		Path:        "/connectors/{connectorName}/activation",
		Summary:     "Activate connector",
		Description: "Activates a registered connector for the authenticated organization. Idempotent: activating an already-active connector succeeds without changing when it was first activated. Refused when the organization's licence does not include the connector.",
		Tags:        []string{"connectors"},
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden,
			http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		result, err := app.Activate(ctx, cl, request.ConnectorName)
		if err != nil {
			return nil, err
		}

		return &Response{Body: result}, nil
	})
}
