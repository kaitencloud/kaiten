package getlicense

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(
		ctx context.Context, cl caller.OrganizationCaller, slug string,
	) (*schema.License, error)
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License slug" example:"license-slug"`
}

type Response struct {
	Body *schema.License
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-license",
		Method:      http.MethodGet,
		Path:        "/licenses/{licenseSlug}",
		Summary:     "Get a license by slug",
		Description: "Retrieve a license by their unique slug",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		license, err := app.Get(ctx, cl, request.LicenseSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: license,
		}, nil
	})
}
