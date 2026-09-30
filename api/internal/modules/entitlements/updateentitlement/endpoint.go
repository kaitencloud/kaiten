package updateentitlement

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) error
}

// Request's Body is schema.Entitlement, the same type create-entitlement and
// get-entitlement use. type and aggregationMethod are immutable and only
// accepted here so a full-replace PUT can echo them back; the handler
// rejects a different value. Slug is structurally writable too, but this
// endpoint has never supported renaming an entitlement -- rejected the same
// way if it differs from the path's.
type Request struct {
	Slug string `path:"entitlementSlug"`
	Body schema.Entitlement
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-entitlement",
		Method:      http.MethodPut,
		Path:        "/entitlements/{entitlementSlug}",
		Summary:     "Update an entitlement",
		Description: "Update an existing entitlement with the provided details",
		Tags:        []string{"entitlements"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.Slug != "" && request.Body.Slug != request.Slug {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateEntitlement.SlugNotRenameable",
				"slug cannot be changed through this endpoint; omit it or send the current slug",
			)
		}

		command := &Command{
			Name:                    request.Body.Name,
			Description:             request.Body.Description,
			Type:                    request.Body.Type,
			AggregationMethod:       request.Body.AggregationMethod,
			GroupSlugs:              request.Body.GroupSlugs,
			Icon:                    request.Body.Icon,
			UnitSingular:            request.Body.UnitSingular,
			UnitPlural:              request.Body.UnitPlural,
			SaleUnitSingular:        request.Body.SaleUnitSingular,
			SaleUnitPlural:          request.Body.SaleUnitPlural,
			SaleUnitFactor:          request.Body.SaleUnitFactor,
			UserFacing:              request.Body.UserFacing,
			DisplayOrder:            request.Body.DisplayOrder,
			WarningThresholdPercent: request.Body.WarningThresholdPercent,
			ResetPeriod:             request.Body.ResetPeriod,
			ResetAnchor:             request.Body.ResetAnchor,
		}

		if err := app.Update(ctx, cl, request.Slug, command); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the EntitlementUpdated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       entitlementEvents.EntitlementUpdated,
		Data:        (*schema.Entitlement)(nil),
		OperationID: "onEntitlementUpdated",
		Summary:     "Entitlement Updated Webhook",
		Description: "Triggered when an entitlement is updated.",
		Tags:        []string{"webhooks", "entitlements"},
	})
}
