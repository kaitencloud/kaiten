package listorganizationtokens

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls, declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	ListOrganizationTokens(ctx context.Context, cl caller.PlatformCaller,
		target uuid.UUID) ([]schema.Token, error)
}

// Request declares orgId because huma requires a field per path placeholder. This
// endpoint passes it to the facade as the target; the handler beneath reads the
// resolved value from targetorg, for the reason written in mintorganizationtoken's
// Request.
type Request struct {
	OrganizationID uuid.UUID `path:"orgId" format:"uuid" doc:"Organization the credential acts inside"`
}

// Response is a list of schema.Token -- the same component the service-account
// token endpoints return, minus the value, which this operation never has.
type Response struct {
	Body []schema.Token `doc:"Active credentials this platform credential holds in the named organization"`
}

// RegisterEndpoint publishes the listing.
//
// Not paginated, deliberately. This is one platform credential's own credentials
// in one organization -- a handful, bounded by how many consumers a deployment
// has, and a caller that needs a cursor to read its own set has a problem no page
// size would fix.
func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterPlatformForOrganization(api, huma.Operation{
		OperationID: "list-organization-tokens",
		Method:      http.MethodGet,
		Path:        "/platform/organizations/{orgId}/tokens",
		Summary:     "List the organization credentials minted for the platform identity",
		Description: "Names the still-active credentials this platform credential minted in the named " +
			"organization, so one can be addressed for revocation: revoke-organization-token takes a " +
			"slug, and a slug is server-generated and cannot be derived from the name the caller " +
			"chose. Only credentials issued by the calling platform credential, in the named " +
			"organization, are listed. No credential value is returned -- these identify, they do " +
			"not authenticate.",
		Tags: []string{"platform"},
		Errors: []int{
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		tokens, err := app.ListOrganizationTokens(ctx, cl, request.OrganizationID)
		if err != nil {
			return nil, err
		}

		return &Response{Body: tokens}, nil
	})
}
