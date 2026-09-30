package deletetokenonserviceaccount

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
	DeleteToken(
		ctx context.Context, cl caller.OrganizationCaller,
		serviceAccountSlug, tokenSlug string,
	) error
}

type Request struct {
	ServiceAccountSlug string `path:"serviceAccountSlug" format:"text" doc:"Service account slug" example:"service-account-slug"`
	TokenSlug          string `path:"tokenSlug" format:"text" doc:"Token slug to revoke" example:"my-token-slug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "delete-service-account-token",
		Method:        http.MethodDelete,
		Path:          "/service-accounts/{serviceAccountSlug}/tokens/{tokenSlug}",
		Summary:       "Revoke a token for a service account",
		Description:   "Revoke an API token for a service account. Once revoked, the token can no longer be used for authentication. The organization context is derived from the authenticated user's JWT token.",
		Tags:          []string{"service-accounts"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteToken(
			ctx, cl, request.ServiceAccountSlug, request.TokenSlug); err != nil {
			return nil, err
		}

		return nil, nil
	})
}
