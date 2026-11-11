package schema

import (
	"encoding/json"
	"fmt"
	"reflect"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
)

// ReportUsageValue is write-only. Read/event value unions never include AI usage.
type ReportUsageValue struct {
	Number *NumberEntitlementValue
	AI     *AiUsageValue
}

func (ReportUsageValue) Schema(r huma.Registry) *huma.Schema {
	r.Schema(reflect.TypeOf(NumberEntitlementValue{}), true, "NumberEntitlementValue")
	r.Schema(reflect.TypeOf(AiUsageValue{}), true, "AiUsageValue")
	return &huma.Schema{OneOf: []*huma.Schema{{Ref: "#/components/schemas/NumberEntitlementValue"}, {Ref: "#/components/schemas/AiUsageValue"}}, Discriminator: &huma.Discriminator{PropertyName: "type", Mapping: map[string]string{"number": "#/components/schemas/NumberEntitlementValue", "ai_usage": "#/components/schemas/AiUsageValue"}}}
}

func (v ReportUsageValue) MarshalJSON() ([]byte, error) {
	if v.AI != nil {
		return json.Marshal(v.AI)
	}
	if v.Number != nil {
		return json.Marshal(v.Number)
	}
	return []byte("null"), nil
}

func (v *ReportUsageValue) UnmarshalJSON(data []byte) error {
	var discriminator struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &discriminator); err != nil {
		return err
	}
	*v = ReportUsageValue{}
	switch discriminator.Type {
	case "number":
		v.Number = &NumberEntitlementValue{}
		return json.Unmarshal(data, v.Number)
	case "ai_usage":
		v.AI = &AiUsageValue{}
		return json.Unmarshal(data, v.AI)
	default:
		return fmt.Errorf("unknown usage value type %q", discriminator.Type)
	}
}

type AiUsage struct {
	InputTokens           *int64  `json:"inputTokens,omitempty" minimum:"0"`
	CacheReadInputTokens  *int64  `json:"cacheReadInputTokens,omitempty" minimum:"0"`
	CacheWriteInputTokens *int64  `json:"cacheWriteInputTokens,omitempty" minimum:"0"`
	OutputTokens          *int64  `json:"outputTokens,omitempty" minimum:"0"`
	Units                 *string `json:"units,omitempty" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$"`
	UnitType              *string `json:"unitType,omitempty" enum:"image,second,frame"`
	DurationMS            *int64  `json:"durationMs,omitempty" minimum:"0"`
}

type AiUsageValue struct {
	Type  string `json:"type" enum:"ai_usage" doc:"Calculation input for a NUMBER_AI_CREDIT entitlement, not a separate read-value type."`
	Phase string `json:"phase" enum:"reserve,commit" doc:"Reserve estimates and holds credits before a provider request; commit calculates actual credits or releases an unsent request. Reservations do not lock the calculation rates."`
	// Validated by the use case to retain the precise transaction-id error codes.
	TransactionID string                  `json:"transactionId,omitempty" doc:"Required call identity, scoped to the instance and entitlement. Use the same identity for reserve and commit, and the identical phase/body for a retry. AI reports use this identity rather than Idempotency-Key."`
	Model         *string                 `json:"model,omitempty" minLength:"1" maxLength:"255"`
	RequestType   *aicredit.RequestType   `json:"requestType,omitempty" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	RequestStatus *aicredit.RequestStatus `json:"requestStatus,omitempty" enum:"SUCCESS,PROVIDER_ERROR,CUSTOMER_ERROR,NOT_SENT"`
	Usage         *AiUsage                `json:"usage,omitempty"`
	TTLSeconds    *int64                  `json:"ttlSeconds,omitempty"`
	// A pointer with omitempty: the request hash is over this struct's JSON, so
	// a report that omits the field must keep marshalling as it did before.
	VendorCost *string `json:"vendorCost,omitempty" pattern:"^[0-9]{1,12}(\\.[0-9]{1,12})?$" example:"0.0123" doc:"Commit only. What the provider charged for this request, in USD, as an exact decimal string. Recorded as evidence beside the cost computed from the model catalogue; it never changes the credits charged."`
}

// The warnings an AI report or an inference record may carry. The set is open:
// clients must tolerate a value they do not know.
const (
	AiWarningModelDeprecated          = "MODEL_DEPRECATED"
	AiWarningEstimateIncomplete       = "ESTIMATE_INCOMPLETE"
	AiWarningReservationExpired       = "RESERVATION_EXPIRED"
	AiWarningModelNotAuthorized       = "MODEL_NOT_AUTHORIZED"
	AiWarningUnknownModel             = "UNKNOWN_MODEL"
	AiWarningConversionInputMissing   = "CONVERSION_INPUT_MISSING"
	AiWarningOverdrawn                = "OVERDRAWN"
	AiWarningNoReservation            = "NO_RESERVATION"
	AiWarningCounterPrecisionDegraded = "COUNTER_PRECISION_DEGRADED"
	// Read side only: the inference is listed without a pricing snapshot
	// because the stored one cannot be decoded.
	AiWarningPricingSnapshotUnreadable = "PRICING_SNAPSHOT_UNREADABLE"
)

// Keep phase examples complete: reserve must not include commit-only fields.
func (AiUsageValue) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	s.Examples = []any{
		map[string]any{"type": "ai_usage", "phase": "reserve", "transactionId": "inference-001", "model": "sushi-assistant", "requestType": "COMPLETION", "usage": map[string]any{"inputTokens": 100, "outputTokens": 50}},
		map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "inference-001", "model": "sushi-assistant", "requestType": "COMPLETION", "requestStatus": "SUCCESS", "usage": map[string]any{"inputTokens": 120, "outputTokens": 60}},
	}
	return s
}

type AiCredits struct {
	Reserved *string `json:"reserved,omitempty"`
	Computed *string `json:"computed,omitempty"`
	Charged  *string `json:"charged,omitempty"`
}

// AiUsageRule names the conversion rule a phase was priced with. The rates
// themselves are in the inference record's pricing snapshot.
type AiUsageRule struct {
	ID          uuid.UUID            `json:"id" format:"uuid"`
	Specificity aicredit.Specificity `json:"specificity" enum:"EXACT_TYPED,EXACT_ALL,ANY_TYPED,ANY_ALL" doc:"How the rule matched: its own model and request type, its own model for every request type, any model for its request type, or any model and request type."`
}

type AiUsageOutcome struct {
	TransactionID string     `json:"transactionId"`
	Phase         string     `json:"phase" enum:"reserve,commit"`
	Status        string     `json:"status" enum:"RESERVED,COMMITTED,RELEASED"`
	Credits       AiCredits  `json:"credits"`
	Remaining     *string    `json:"remaining" nullable:"true"`
	ExpiresAt     *time.Time `json:"expiresAt,omitempty"`
	Authorized    *bool      `json:"authorized,omitempty"`
	Warnings      []string   `json:"warnings" nullable:"false"`
	// A pointer with omitempty: the answer of each phase is stored and replayed
	// as it was, so one recorded before this member existed replays without it.
	Rule *AiUsageRule `json:"rule,omitempty" doc:"The conversion rule that priced this phase. Absent when no rule applied, and on the replay of a phase answered before the member existed."`
}
