package getlicenseentitlement

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
	GetEntitlement(
		ctx context.Context, cl caller.OrganizationCaller, licenseSlug, entitlementSlug string,
	) (*schema.LicenseEntitlement, error)
}

type Request struct {
	LicenseSlug     string `path:"licenseSlug"`
	EntitlementSlug string `path:"entitlementSlug"`
}

type Response struct {
	Body *schema.LicenseEntitlement
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-license-entitlement",
		Method:      http.MethodGet,
		Path:        "/licenses/{licenseSlug}/entitlements/{entitlementSlug}",
		Summary:     "Get a license entitlement",
		Description: "Retrieve a entitlement for a license by their unique slugs",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		licenseEntitlement, err := app.GetEntitlement(
			ctx, cl, request.LicenseSlug, request.EntitlementSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: licenseEntitlement,
		}, nil
	})
}
