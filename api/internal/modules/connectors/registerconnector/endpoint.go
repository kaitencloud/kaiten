package registerconnector

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Registrar is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Registrar interface {
	RegisterConnector(
		ctx context.Context, cl caller.PlatformCaller, body RegisterConnectorBody,
	) (*schema.Connector, error)
}

type Request struct {
	Body RegisterConnectorBody `doc:"Connector registration payload containing metadata and settings schema"`
}

type RegisterConnectorBody struct {
	Name           string         `json:"name" doc:"Stable connector identifier" example:"kaiten.integration.crm.attio"`
	Version        string         `json:"version" doc:"Connector version" example:"1.0.0"`
	SettingsSchema map[string]any `json:"settings_schema" doc:"JSON schema used to validate organization-level connector settings"`
	// EntitlementSlug names the BOOLEAN entitlement an organization's license must
	// grant before it may activate this connector. Optional, and absent means
	// ungated -- which is the right default for a self-hosted deployment, where
	// there is no licensing authority to ask and every registered connector is
	// simply available.
	//
	// Declared by the connector at registration rather than mapped by Kaiten,
	// because Kaiten does not know what anybody sells: a connector hosted elsewhere
	// and registered over this endpoint brings its own gate, and there is no
	// connector-to-entitlement table here to drift out of date.
	EntitlementSlug *string `json:"entitlement_slug,omitempty" doc:"Slug of the BOOLEAN entitlement a license must grant for an organization to activate this connector. Absent means the connector is ungated." example:"connector-attio"`
}

type Response struct {
	Body *schema.Connector
}

// RegisterEndpoint publishes connector registration on the PLATFORM document.
func RegisterEndpoint(api huma.API, app Registrar) {
	kaitenhuma.RegisterPlatform(api, huma.Operation{
		OperationID: "register-connector",
		Method:      http.MethodPost,
		Path:        "/platform/connectors",
		Summary:     "Register connector manifest",
		Description: "Registers or updates connector metadata and settings schema for this Kaiten deployment",
		Tags:        []string{"connectors"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		result, err := app.RegisterConnector(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}

		return &Response{Body: result}, nil
	})
}
