package updatefeatureflag

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

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller,
		slug string, flag *schema.FeatureFlag,
	) error
}

// Request's Body is schema.FeatureFlag, the same type create-feature-flag
// and get-feature-flag use. Slug stays writable even though the path
// already carries one -- the update writes it, so this is how a flag is
// renamed.
type Request struct {
	FeatureFlagSlug string             `path:"featureFlagSlug"`
	Body            schema.FeatureFlag `doc:"Feature flag details"`
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-feature-flag",
		Method:      http.MethodPut,
		Path:        "/feature-flags/{featureFlagSlug}",
		Summary:     "Update a featureflag",
		Description: "Update a featureflag with the provided details",
		Tags:        []string{"featureflags"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Update(
			ctx, cl, request.FeatureFlagSlug, &request.Body); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the FeatureFlagUpdated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.FeatureFlagUpdated,
		Data:        (*schema.FeatureFlag)(nil),
		OperationID: "onFeatureFlagUpdated",
		Summary:     "Feature Flag Updated Webhook",
		Description: "Triggered when a feature flag is updated.",
		Tags:        []string{"webhooks", "featureflags"},
	})
}
