package getsettings

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
	GetSettings(
		ctx context.Context, cl caller.OrganizationCaller, name string,
	) (*schema.ConnectorSettings, error)
}

type Request struct {
	ConnectorName string `path:"connectorName" doc:"Stable connector name" example:"kaiten.integration.crm.attio"`
}

type Response struct {
	Body *schema.ConnectorSettings
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-connector-settings",
		Method:      http.MethodGet,
		Path:        "/connectors/{connectorName}/settings",
		Summary:     "Get connector settings",
		Description: "Get settings for a connector scoped to the authenticated organization. Write-only fields (flagged `writeOnly` in the connector settings schema) are returned redacted as `***`.",
		Tags:        []string{"connectors"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		result, err := app.GetSettings(ctx, cl, request.ConnectorName)
		if err != nil {
			return nil, err
		}

		return &Response{Body: result}, nil
	})
}
