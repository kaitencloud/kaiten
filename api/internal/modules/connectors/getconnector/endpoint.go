package getconnector

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(
		ctx context.Context, cl caller.OrganizationCaller, name string,
	) (*schema.Connector, error)
}

type Request struct {
	ConnectorName string `path:"connectorName" doc:"Stable connector name" example:"kaiten.integration.crm.attio"`
}

type Response struct {
	Body *schema.Connector
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-connector",
		Method:      http.MethodGet,
		Path:        "/connectors/{connectorName}",
		Summary:     "Get connector registration",
		Description: "Retrieves a registered connector resource including version and settings schema",
		Tags:        []string{"connectors"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		result, err := app.Get(ctx, cl, request.ConnectorName)
		if err != nil {
			return nil, err
		}

		return &Response{Body: result}, nil
	})
}
