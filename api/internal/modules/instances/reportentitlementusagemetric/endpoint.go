package reportentitlementusagemetric

import (
	"context"
	"net/http"
	"regexp"

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
	) (*Result, error)
}

// transactionIDPattern is the transactionId format, checked here rather than
// as a schema pattern so that a malformed key answers the documented
// ReportEntitlementUsageMetric.InvalidTransactionId, not Huma's generic 422.
var transactionIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

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
	Metadata map[string]any          `json:"metadata,omitempty" doc:"Optional metadata for the usage report, a JSON object stored with it in the usage history when its compact encoding is at most 4 KiB. Above that it is not stored, the report is still counted, and the response carries Kaiten-Metadata-Dropped: too_large. It must contain no personal data: anyone who can read the organization's instances can read it, for as long as the usage history is kept. Numbers are read as 64-bit floats, so send large identifiers as strings."`
	// TransactionID is a pointer so that an empty key is refused rather than
	// read as no key.
	TransactionID *string `json:"transactionId,omitempty" doc:"Optional idempotency key, 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively. A report sent again with the same key and the same behavior and value within KAITEN_USAGE_IDEMPOTENCY_WINDOW (35 days by default) is applied once: the retry answers 200 with the original response and the Idempotent-Replayed header, and changes nothing. The same key with another behavior or value answers 409 ReportEntitlementUsageMetric.TransactionIdReused. A rejected report does not consume its key. Scoped to the instance and entitlement: one business event may feed two meters under one key." example:"llm-call-9f2c:tokens"`
}

type Response struct {
	IdempotentReplayed string `header:"Idempotent-Replayed" doc:"true when the report replays an earlier one sent with the same transactionId: the body is that report's original response and nothing was counted again"`
	MetadataDropped    string `header:"Kaiten-Metadata-Dropped" doc:"too_large when the report's metadata was above 4 KiB and was not stored; the report itself was counted"`
	Body               *schema.EntitlementUsage
}

func RegisterEndpoint(api huma.API, app Reporter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "reportEntitlementUsageMetric",
		Method:      "POST",
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage",
		Summary:     "Report entitlement usage metric for an instance",
		Description: "Report a usage metric for a specific entitlement in a given instance, with optional metadata. The server dates every report on receipt; the request carries no timestamp. Send a transactionId to make retries safe: without one, a report sent twice counts twice.",
		Tags:        []string{"instances"},
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusConflict,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
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

		if request.Body.TransactionID != nil && !transactionIDPattern.MatchString(*request.Body.TransactionID) {
			return nil, apierrors.UnprocessableEntity(
				"ReportEntitlementUsageMetric.InvalidTransactionId",
				"transactionId must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-'",
			)
		}

		command := &Command{
			Value:         request.Body.Value.Number.Value,
			Behavior:      behavior,
			Metadata:      request.Body.Metadata,
			TransactionID: request.Body.TransactionID,
		}

		result, err := app.ReportEntitlementUsage(
			ctx, cl, request.InstanceSlug, request.EntitlementSlug, command)
		if err != nil {
			return nil, err
		}

		response := &Response{Body: result.Usage, MetadataDropped: result.MetadataDropped}
		if result.Replayed {
			response.IdempotentReplayed = "true"
		}
		return response, nil
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
