package getfeatureflag

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Get(
		ctx context.Context, cl caller.OrganizationCaller, slug string,
	) (*schema.FeatureFlag, error)
}

type Request struct {
	FeatureFlagSlug string `path:"featureFlagSlug"`
}

type Response struct {
	Body *schema.FeatureFlag
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-feature-flag",
		Method:      http.MethodGet,
		Path:        "/feature-flags/{featureFlagSlug}",
		Summary:     "Get a feature flag by slug",
		Description: "Get a feature flag with the provided slug",
		Tags:        []string{"featureflags"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		flag, err := app.Get(ctx, cl, request.FeatureFlagSlug)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: flag,
		}, nil
	})
}
