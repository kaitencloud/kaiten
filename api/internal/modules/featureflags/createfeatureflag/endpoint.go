package createfeatureflag

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

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller, flag *schema.FeatureFlag,
	) (*schema.FeatureFlag, error)
}

type Request struct {
	Body schema.FeatureFlag `doc:"Feature flag details"`
}

type Response struct {
	Body *schema.FeatureFlag `doc:"Created feature flag"`
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-feature-flag",
		Method:        http.MethodPost,
		Path:          "/feature-flags",
		Summary:       "Create a new featureflag",
		Description:   "Create a new featureflag with the provided details",
		Tags:          []string{"featureflags"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		flag, err := app.Create(ctx, cl, &request.Body)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: flag,
		}, nil
	})
}

// RegisterWebhook declares the FeatureFlagCreated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.FeatureFlagCreated,
		Data:        (*schema.FeatureFlag)(nil),
		OperationID: "onFeatureFlagCreated",
		Summary:     "Feature Flag Created Webhook",
		Description: "Triggered when a new feature flag is created.",
		Tags:        []string{"webhooks", "featureflags"},
	})
}
