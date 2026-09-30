package deletefeatureflag

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	FeatureFlagSlug string `path:"featureFlagSlug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-feature-flag",
		Method:      http.MethodDelete,
		Path:        "/feature-flags/{featureFlagSlug}",
		Summary:     "Delete a featureflag",
		Description: "Delete a featureflag with the provided details",
		Tags:        []string{"featureflags"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Delete(ctx, cl, request.FeatureFlagSlug); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the FeatureFlagDeleted webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.FeatureFlagDeleted,
		Data:        (*schema.FeatureFlag)(nil),
		OperationID: "onFeatureFlagDeleted",
		Summary:     "Feature Flag Deleted Webhook",
		Description: "Triggered when a feature flag is deleted.",
		Tags:        []string{"webhooks", "featureflags"},
	})
}
