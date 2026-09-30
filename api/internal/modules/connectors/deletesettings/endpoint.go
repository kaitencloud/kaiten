package deletesettings

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	DeleteSettings(ctx context.Context, cl caller.OrganizationCaller, name string) error
}

type Request struct {
	ConnectorName string `path:"connectorName" doc:"Stable connector name" example:"kaiten.integration.crm.attio"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "delete-connector-settings",
		Method:        http.MethodDelete,
		Path:          "/connectors/{connectorName}/settings",
		Summary:       "Delete connector settings",
		Description:   "Delete connector settings for the authenticated organization",
		Tags:          []string{"connectors"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteSettings(ctx, cl, request.ConnectorName); err != nil {
			return nil, err
		}

		return nil, nil
	})
}
