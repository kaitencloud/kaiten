package deactivateconnector

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deactivator is the one facade method this operation calls. Declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close a
// cycle.
type Deactivator interface {
	Deactivate(ctx context.Context, cl caller.OrganizationCaller, name string) error
}

type Request struct {
	ConnectorName string `path:"connectorName" doc:"Stable connector name" example:"kaiten.integration.crm.attio"`
}

type Response struct{}

func RegisterEndpoint(api huma.API, app Deactivator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "deactivate-connector",
		Method:        http.MethodDelete,
		Path:          "/connectors/{connectorName}/activation",
		Summary:       "Deactivate connector",
		Description:   "Deactivates a connector for the authenticated organization. Idempotent, and never refused for an unregistered or unlicensed connector: an organization must always be able to stop using something.",
		Tags:          []string{"connectors"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Deactivate(ctx, cl, request.ConnectorName); err != nil {
			return nil, err
		}

		return &Response{}, nil
	})
}
