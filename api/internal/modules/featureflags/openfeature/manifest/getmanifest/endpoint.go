package getmanifest

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Getter interface {
	Manifest(ctx context.Context, cl caller.OrganizationCaller) (*ManifestEnvelope, error)
}

type GetManifestOutput struct {
	XManifestCapabilities string `header:"X-Manifest-Capabilities"`
	Body                  ManifestEnvelope
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-openfeature-manifest",
		Method:      http.MethodGet,
		Path:        "/openfeature/v0/manifest",
		Summary:     "Get OpenFeature manifest",
		Description: "Returns a manifest of all feature flags that have a fallback_value set in their metadata",
		Tags:        []string{"OpenFeature"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, _ *struct{}) (*GetManifestOutput, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		envelope, err := app.Manifest(ctx, cl)
		if err != nil {
			return nil, err
		}

		return &GetManifestOutput{
			XManifestCapabilities: "read",
			Body:                  *envelope,
		}, nil
	})
}
