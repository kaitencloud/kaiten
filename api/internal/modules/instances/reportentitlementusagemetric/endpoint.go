package reportentitlementusagemetric

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Reporter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Reporter interface {
	ReportEntitlementUsage(
		ctx context.Context, cl caller.OrganizationCaller,
		instanceSlug, entitlementSlug string, cmd *Command,
	) (*schema.EntitlementUsage, error)
}

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Entitlement slug" example:"entitlement-slug"`
	Body            ReportEntitlementUsageBody
}

// ReportEntitlementUsageBody is what a client sends, as opposed to the
// EntitlementUsage response DTO. The instance and entitlement are named in
// the path, and everything the read side adds -- the resolved identifiers,
// the license grant and the current period bounds -- is computed by the
// server. This is the endpoint the audit named first: its shared
// struct published four readOnly properties as required, so a generated
// client believed it had to send them.
type ReportEntitlementUsageBody struct {
	Value    schema.EntitlementValue `json:"value" doc:"Reported entitlement value, discriminated by the 'type' field. Usage reporting accepts the number variant only."`
	Behavior string                  `json:"behavior,omitempty" doc:"Report behavior: append folds the value into the stored total through the aggregation method; set overwrites it" enum:"append,set"`
	Metadata map[string]any          `json:"metadata,omitempty" doc:"Optional metadata for the usage report"`
}

type Response struct {
	Body *schema.EntitlementUsage
}

func RegisterEndpoint(api huma.API, app Reporter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "reportEntitlementUsageMetric",
		Method:      "POST",
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage",
		Summary:     "Report entitlement usage metric for an instance",
		Description: "Report a usage metric for a specific entitlement in a given instance. This endpoint allows you to report the usage of an entitlement, including optional metadata and a timestamp.",
		Tags:        []string{"instances"},
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusConflict,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		behavior := Behavior(request.Body.Behavior)
		if behavior != BehaviorAppend && behavior != BehaviorSet {
			return nil, apierrors.UnprocessableEntity(
				"ReportEntitlementUsageMetric.InvalidBehavior",
				"behavior must be one of: append, set",
			)
		}

		if request.Body.Value.Number == nil {
			return nil, apierrors.UnprocessableEntity(
				"ReportEntitlementUsageMetric.InvalidValueType",
				"value must be a NumberEntitlementValue for usage reporting",
			)
		}

		command := &Command{
			Value:    request.Body.Value.Number.Value,
			Behavior: behavior,
			Metadata: request.Body.Metadata,
		}

		entitlementUsage, err := app.ReportEntitlementUsage(
			ctx, cl, request.InstanceSlug, request.EntitlementSlug, command)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: entitlementUsage,
		}, nil
	})
}

// RegisterWebhook declares the six webhook contracts the usage-report path
// emits: the report outcome itself, the two crossing signals, the legacy
// exact-cap signal, and one per closed usage window.
func RegisterWebhook(api huma.API) {
	webhook.Declare(
		api,
		webhook.Declaration{
			Event:       events.InstanceEntitlementUsageReached,
			Data:        (*schema.EntitlementUsage)(nil),
			OperationID: "onInstanceEntitlementUsageReached",
			Summary:     "Instance Entitlement Usage Reached Webhook",
			Description: "Triggered when an instance's entitlement usage reaches its threshold.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.InstanceEntitlementCapExceeded,
			Data:        (*InstanceEntitlementCapExceeded)(nil),
			OperationID: "onInstanceEntitlementCapExceeded",
			Summary:     "Instance Entitlement Cap Exceeded Webhook",
			Description: "Triggered when a SOFT-enforcement entitlement's usage crosses from below the cap to above it. Fires once per crossing.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.InstanceEntitlementUsageWarningThresholdReached,
			Data:        (*InstanceEntitlementUsageWarningThresholdReached)(nil),
			OperationID: "onInstanceEntitlementUsageWarningThresholdReached",
			Summary:     "Instance Entitlement Usage Warning Threshold Reached Webhook",
			Description: "Triggered when an instance's entitlement usage crosses its configured early-warning percentage boundary, before the cap is reached. Fires once per crossing.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.EntitlementUsageReportAccepted,
			Data:        (*InstanceEntitlementUsageReportAccepted)(nil),
			OperationID: "onInstanceEntitlementUsageReportAccepted",
			Summary:     "Entitlement Usage Report Accepted Webhook",
			Description: "Triggered when a usage report is persisted, including a SOFT-enforcement overage.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.EntitlementUsageReportRejected,
			Data:        (*InstanceEntitlementUsageReportAccepted)(nil),
			OperationID: "onInstanceEntitlementUsageReportRejected",
			Summary:     "Entitlement Usage Report Rejected Webhook",
			Description: "Triggered when a usage report is refused because it would take a HARD-enforcement entitlement past its cap. The usage is not persisted.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.InstanceEntitlementUsagePeriodRolledOver,
			Data:        (*InstanceEntitlementUsagePeriodRolledOver)(nil),
			OperationID: "onInstanceEntitlementUsagePeriodRolledOver",
			Summary:     "Entitlement Usage Period Rolled Over Webhook",
			Description: "Triggered once per usage window closed by a report: the entitlement's own stored bucket, and one synthetic event per window skipped entirely since the last report.",
			Tags:        []string{"webhooks", "instances"},
		},
	)
}
