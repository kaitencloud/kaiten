package createtokenonserviceaccount

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	CreateToken(
		ctx context.Context, cl caller.OrganizationCaller,
		serviceAccountSlug, name string, slug *string,
		scopes []string, expiresAt *time.Time,
	) (*schema.PlainToken, error)
}

type Request struct {
	ServiceAccountSlug string            `path:"serviceAccountSlug" format:"text" doc:"Service account slug" example:"service-account-slug"`
	Body               schema.PlainToken `doc:"Token creation details"`
}

type Response struct {
	Body *schema.PlainToken `doc:"Created token with secret value (only shown once)"`
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-service-account-token",
		Method:        http.MethodPost,
		Path:          "/service-accounts/{serviceAccountSlug}/tokens",
		Summary:       "Create a new token for a service account",
		Description:   "Create a new API token for a service account. The token value is only returned once upon creation and cannot be retrieved again. The organization context is derived from the authenticated user's JWT token.",
		Tags:          []string{"service-accounts"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var slug *string
		if request.Body.Slug != "" {
			slug = &request.Body.Slug
		}
		token, err := app.CreateToken(ctx, cl, request.ServiceAccountSlug, request.Body.Name,
			slug, request.Body.Scopes, request.Body.ExpiresAt)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: token,
		}, nil
	})
}
