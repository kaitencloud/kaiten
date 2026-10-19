package schema

import (
	"encoding/json"
	"fmt"
	"reflect"
	"time"

	"github.com/danielgtaylor/huma/v2"

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
	Type  string `json:"type" enum:"ai_usage"`
	Phase string `json:"phase" enum:"reserve,commit"`
	// Validated by the use case to retain the precise transaction-id error codes.
	TransactionID string                  `json:"transactionId,omitempty"`
	Model         *string                 `json:"model,omitempty" minLength:"1" maxLength:"255"`
	RequestType   *aicredit.RequestType   `json:"requestType,omitempty" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	RequestStatus *aicredit.RequestStatus `json:"requestStatus,omitempty" enum:"SUCCESS,PROVIDER_ERROR,CUSTOMER_ERROR,NOT_SENT"`
	Usage         *AiUsage                `json:"usage,omitempty"`
	TTLSeconds    *int64                  `json:"ttlSeconds,omitempty"`
}

type AiCredits struct {
	Reserved *string `json:"reserved,omitempty"`
	Computed *string `json:"computed,omitempty"`
	Charged  *string `json:"charged,omitempty"`
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
}
