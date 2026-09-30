package getplatformcredential

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls, declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Reader interface {
	GetCredential(ctx context.Context, cl caller.PlatformCaller) (schema.PlatformCredential, error)
}

// Request takes nothing. That is the design: the credential being described is
// the one presented in the Authorization header, and offering any way to name a
// different one would turn introspection into enumeration.
type Request struct{}

type Response struct {
	Body schema.PlatformCredential
}

func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterPlatform(api, huma.Operation{
		OperationID: "get-platform-me",
		Method:      http.MethodGet,
		Path:        "/platform/me",
		Summary:     "Describe the calling platform credential",
		Description: "Returns the name, scopes, expiry and creation time of the platform " +
			"credential used to make the request, plus the platform identity it " +
			"authenticates. The token value is never returned -- it is shown once, at creation.",
		Tags:          []string{"platform"},
		DefaultStatus: http.StatusOK,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		credential, err := app.GetCredential(ctx, cl)
		if err != nil {
			return nil, err
		}

		return &Response{Body: credential}, nil
	})
}
