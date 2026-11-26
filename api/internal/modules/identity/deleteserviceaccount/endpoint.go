package deleteserviceaccount

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
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	ServiceAccountSlug string `path:"serviceAccountSlug" format:"text" doc:"Service account slug" example:"service-account-slug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-service-account",
		Method:      http.MethodDelete,
		Path:        "/service-accounts/{serviceAccountSlug}",
		Summary:     "Delete a service account",
		Description: "Delete a service account of the organization and revoke every token it still holds: they stop authenticating at once. " +
			"The rows the account wrote keep it as their author, and its slug can be given to a new account. " +
			"On Kaiten Cloud, the account no longer counts against the service-accounts allowance of the organization's License. " +
			"The organization context is derived from the authenticated user's JWT token.",
		Tags:          []string{"service-accounts"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Delete(ctx, cl, request.ServiceAccountSlug); err != nil {
			return nil, err
		}

		return nil, nil
	})
}
