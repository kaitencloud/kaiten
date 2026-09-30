package deleteintegrations

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
	DeleteIntegration(
		ctx context.Context, cl caller.OrganizationCaller, instanceSlug, integrationName string,
	) error
}

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	IntegrationName string `path:"integrationName" doc:"Integration adapter name" example:"kaiten.integration.crm.attio"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "delete-instance-integration",
		Method:        http.MethodDelete,
		Path:          "/instances/{instanceSlug}/integrations/{integrationName}",
		Summary:       "Delete an instance integration",
		Description:   "Delete a single integration for an instance",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteIntegration(ctx, cl, request.InstanceSlug, request.IntegrationName); err != nil {
			return nil, err
		}

		return nil, nil
	})
}
