package createentitlement

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*schema.Entitlement, error)
}

type Request struct {
	Body schema.Entitlement
}

type Response struct {
	Body *schema.Entitlement
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-entitlement",
		Method:        http.MethodPost,
		Path:          "/entitlements",
		Summary:       "Create a new entitlement",
		Description:   "Create a new entitlement with the provided details. A NUMBER entitlement can be combined (usageSource COMBINED_USAGE): the weighted sum of the usage of at least two other entitlements, its sources, computed when it is read and for display only. Its sources must be NUMBER or NUMBER_AI_CREDIT entitlements that are not combined themselves, aggregated by SUM or COUNT, on the same resetPeriod and resetAnchor as each other (lifetime included), which the combined entitlement takes: leave out its own resetPeriod and resetAnchor, or send that window. A 422 names what a source or its weight breaks.",
		Tags:          []string{"entitlements"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.Type == nil {
			return nil, apierrors.UnprocessableEntity("CreateEntitlement.TypeRequired", "type is required")
		}
		var slug *string
		if request.Body.Slug != "" {
			slug = &request.Body.Slug
		}
		command := &Command{
			Name:                    request.Body.Name,
			Description:             request.Body.Description,
			Type:                    *request.Body.Type,
			AggregationMethod:       request.Body.AggregationMethod,
			UsageSource:             request.Body.UsageSource,
			Sources:                 request.Body.Sources,
			Slug:                    slug,
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

		entitlement, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: entitlement,
		}, nil
	})
}

// RegisterWebhook declares the EntitlementCreated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       entitlementEvents.EntitlementCreated,
		Data:        (*schema.Entitlement)(nil),
		OperationID: "onEntitlementCreated",
		Summary:     "Entitlement Created Webhook",
		Description: "Triggered when a new entitlement is created.",
		Tags:        []string{"webhooks", "entitlements"},
	})
}
