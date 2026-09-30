package updatesettings

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	UpdateSettings(
		ctx context.Context, cl caller.OrganizationCaller,
		name string, body schema.ConnectorSettings,
	) (*schema.ConnectorSettings, error)
}

type Request struct {
	ConnectorName string                   `path:"connectorName" doc:"Stable connector name" example:"kaiten.integration.crm.attio"`
	Body          schema.ConnectorSettings `doc:"Connector settings payload to upsert"`
}

type Response struct {
	Body *schema.ConnectorSettings
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-connector-settings",
		Method:      http.MethodPut,
		Path:        "/connectors/{connectorName}/settings",
		Summary:     "Upsert connector settings",
		Description: "Create or update connector settings for the authenticated organization. Write-only fields (flagged `writeOnly` in the connector settings schema) may be omitted or sent as `***` to keep the stored value; they are returned redacted.",
		Tags:        []string{"connectors"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		result, err := app.UpdateSettings(ctx, cl, request.ConnectorName, request.Body)
		if err != nil {
			return nil, err
		}

		return &Response{Body: result}, nil
	})
}
