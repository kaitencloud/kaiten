package reportentitlementusagemetric

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
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

// transactionIDPattern is the key's format, checked here rather than as a
// schema pattern so that a malformed key answers the documented
// ReportEntitlementUsageMetric.InvalidTransactionId, not Huma's generic 422.
var transactionIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

// idempotencyKeyLocation is where a refusal of the key points (errors[].location).
const idempotencyKeyLocation = "header.Idempotency-Key"

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Entitlement slug" example:"entitlement-slug"`
	// IdempotencyKey is the report's key (V31-07). It travels as a header, not in
	// the body, and is stored and read back as transactionId everywhere else.
	// idempotencyKeySent is whether the header was sent at all, which
	// IdempotencyKey alone cannot say: Huma binds absent and empty alike.
	idempotencyKeySent bool
	IdempotencyKey     string `header:"Idempotency-Key" doc:"Numeric reports only; AI usage rejects this header and uses value.transactionId for immutable reserve/commit replay. Optional idempotency key: the id of the business event this report counts, 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively. A report sent again with the same key and the same behavior and value within KAITEN_USAGE_IDEMPOTENCY_WINDOW (35 days by default) is applied once: the retry answers 200 with the original response and the Idempotent-Replayed header, and changes nothing. The same key with another behavior or value answers 409 ReportEntitlementUsageMetric.TransactionIdReused. A rejected report does not consume its key. Scoped to the instance and entitlement: one business event may feed two meters under one key. Stored and read back as transactionId." example:"llm-call-9f2c:tokens"`
	Body               ReportEntitlementUsageBody
}

// Resolve records whether Idempotency-Key was sent, empty or not.
func (r *Request) Resolve(ctx huma.Context) []error {
	ctx.EachHeader(func(name, _ string) {
		if strings.EqualFold(name, "Idempotency-Key") {
			r.idempotencyKeySent = true
		}
	})
	return nil
}

// ReportEntitlementUsageBody is what a client sends, as opposed to the
// EntitlementUsage response DTO. The instance and entitlement are named in
// the path, and everything the read side adds -- the resolved identifiers,
// the license grant and the current period bounds -- is computed by the
// server. This is the endpoint the audit named first: its shared
// struct published four readOnly properties as required, so a generated
// client believed it had to send them.
type ReportEntitlementUsageBody struct {
	Value    schema.ReportUsageValue `json:"value" doc:"Usage input for an entitlement, discriminated by type. Ordinary numeric entitlements accept number with append or set. NUMBER_AI_CREDIT is a numeric entitlement with model-usage calculation: send ai_usage to reserve or commit provider quantities, or number with append for credit adjustments/refunds. Read responses remain numeric credit counters."`
	Behavior string                  `json:"behavior,omitempty" doc:"Numeric behavior: append folds the value into the counter; set replaces it for ordinary NUMBER entitlements. AI credit entitlements accept only append adjustments. For ai_usage, omit behavior or use append; phase selects reserve or commit." enum:"append,set"`
	Metadata map[string]any          `json:"metadata,omitempty" doc:"Optional metadata for the usage report, a JSON object stored with it in the usage history when its compact encoding is at most 4 KiB. Above that it is not stored, the report is still counted, and the response carries Kaiten-Metadata-Dropped: too_large. It must contain no personal data: anyone who can read the organization's instances can read it, for as long as the usage history is kept. Numbers are read as 64-bit floats, so send large identifiers as strings."`
}

// ReportedEntitlementUsage is the report's answer: the counter as the gauge
// reads show it, plus the key the report was accepted under. Source and
// Provenance shadow the embedded members to make them nullable here only: a
// replay answers from the journal, which stores neither (V31-55), while the
// gauge reads always have both.
type ReportedEntitlementUsage struct {
	schema.EntitlementUsage
	Source        *string            `json:"source" enum:"license,addon,exception" nullable:"true" doc:"license: the licence grants it (add-ons, boosts and an exception may change it); addon: an add-on attached does; exception: only the instance's exception does. Null on numeric journal replay; AI phase replay preserves its original snapshot."`
	Provenance    *schema.Provenance `json:"provenance" doc:"What the licence, the add-ons and the boosts each contribute. Null on numeric journal replay; AI phase replay preserves its original snapshot."`
	TransactionID *string            `json:"transactionId" nullable:"true" doc:"The Idempotency-Key this report was accepted under, echoed on the first answer and on every replay; null when the request carried none (always null for AI usage, whose phase key is ai.transactionId). A client can tell from it that the server honours the key."`
}

// TransformSchema publishes the null members as null, a $ref included.
func (ReportedEntitlementUsage) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, ReportedEntitlementUsage{})
}

// reported wraps a usage in the report's answer.
func reported(usage *schema.EntitlementUsage, replayed bool, transactionID *string) *ReportedEntitlementUsage {
	out := &ReportedEntitlementUsage{EntitlementUsage: *usage, Source: nil, Provenance: nil, TransactionID: transactionID}
	if (!replayed || usage.AI != nil) && usage.Source != "" {
		source := usage.Source
		out.Source = &source
		out.Provenance = usage.Provenance
	}
	return out
}

type Response struct {
	IdempotentReplayed string `header:"Idempotent-Replayed" doc:"true on numeric Idempotency-Key replay or AI value.transactionId phase replay; nothing was counted again"`
	MetadataDropped    string `header:"Kaiten-Metadata-Dropped" doc:"too_large when the report's metadata was above 4 KiB and was not stored; the report itself was counted"`
	Body               *ReportedEntitlementUsage
}

func RegisterEndpoint(api huma.API, app Reporter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "reportEntitlementUsageMetric",
		Method:      "POST",
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage",
		Summary:     "Report entitlement usage metric for an instance",
		Description: "Report a usage metric for a specific entitlement in a given instance, with optional metadata. The server dates every report on receipt; the request carries no timestamp. Numeric reports use Idempotency-Key for safe retries; without one, numeric reports sent twice count twice. AI usage uses value.transactionId for immutable reserve/commit phase replay and refuses Idempotency-Key with 422 ReportEntitlementUsageMetric.AiIdempotencyKeyUnsupported.",
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
		if request.Body.Value.AI != nil && behavior == "" {
			behavior = BehaviorAppend
		}
		if request.Body.Value.AI == nil && behavior != BehaviorAppend && behavior != BehaviorSet {
			return nil, apierrors.UnprocessableEntity(
				"ReportEntitlementUsageMetric.InvalidBehavior",
				"behavior must be one of: append, set",
			)
		}

		if request.Body.Value.Number == nil && request.Body.Value.AI == nil {
			return nil, apierrors.UnprocessableEntity(
				"ReportEntitlementUsageMetric.InvalidValueType",
				"value must be a number or ai_usage input for usage reporting",
			)
		}

		// An absent header is no key. A header sent empty is a malformed key,
		// not an absent one (S01-084): Huma binds both to "", so the raw
		// request tells them apart.
		if request.Body.Value.AI != nil && request.idempotencyKeySent {
			return nil, apierrors.UnprocessableEntityWithErrors("ReportEntitlementUsageMetric.AiIdempotencyKeyUnsupported", "AI usage uses value.transactionId for phase replay; do not send Idempotency-Key", &apierrors.ErrorDetail{Message: "use value.transactionId instead", Location: idempotencyKeyLocation})
		}
		var transactionID *string
		if key := request.IdempotencyKey; request.idempotencyKeySent {
			if !transactionIDPattern.MatchString(key) {
				return nil, apierrors.UnprocessableEntityWithErrors(
					"ReportEntitlementUsageMetric.InvalidTransactionId",
					"Idempotency-Key must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-'",
					&apierrors.ErrorDetail{Message: "the key's format", Location: idempotencyKeyLocation, Value: key},
				)
			}
			transactionID = &key
		}

		command := &Command{
			AI:            request.Body.Value.AI,
			Behavior:      behavior,
			Metadata:      request.Body.Metadata,
			TransactionID: transactionID,
		}

		if request.Body.Value.Number != nil {
			command.Value = request.Body.Value.Number.Value
		}
		result, err := app.ReportEntitlementUsage(
			ctx, cl, request.InstanceSlug, request.EntitlementSlug, command)
		if err != nil {
			return nil, err
		}

		response := &Response{
			Body:            reported(result.Usage, result.Replayed, transactionID),
			MetadataDropped: result.MetadataDropped,
		}
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
	RegisterAIWebhooks(api)
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

func RegisterAIWebhooks(api huma.API) {
	webhook.Declare(
		api,
		webhook.Declaration{Event: events.InstanceEntitlementMaximumExceeded, Data: (*InstanceEntitlementCapExceeded)(nil), OperationID: "onInstanceEntitlementMaximumExceeded", Summary: "Instance entitlement maximum exceeded", Description: "A committed AI usage charge crossed a soft pool's maximum.", Tags: []string{"webhooks", "instances"}},
		webhook.Declaration{Event: events.InstanceAIModelUsageUnauthorized, Data: (*InstanceAIModelUsageUnauthorized)(nil), OperationID: "onInstanceAIModelUsageUnauthorized", Summary: "Unauthorized model usage", Description: "AI usage was recorded without an authorized model conversion rule.", Tags: []string{"webhooks", "instances"}},
	)
}
