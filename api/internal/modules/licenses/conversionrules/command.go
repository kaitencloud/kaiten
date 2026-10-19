// Package conversionrules shares the rules' exact-number validation and persistence.
package conversionrules

import (
	"encoding/json"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

type Pricing struct {
	Rates                    schema.ConversionRates `json:"rates"`
	MinimumCreditsPerRequest string                 `json:"minimumCreditsPerRequest" required:"false" default:"0" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$"`
	MaximumCreditsPerRequest *string                `json:"maximumCreditsPerRequest" required:"false" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$"`
	ChargeOnError            aicredit.ChargeOnError `json:"chargeOnError" required:"false" default:"NEVER" enum:"NEVER,ALWAYS,PROVIDER_ERROR_ONLY"`
}

type CreateConversionRuleBody struct {
	EntitlementSlug string                `json:"entitlementSlug" minLength:"1"`
	ModelSlug       *string               `json:"modelSlug" required:"false"`
	RequestType     *aicredit.RequestType `json:"requestType" required:"false" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	Pricing
}

// UpdateConversionRuleBody replaces pricing. Identity echoes are optional but immutable;
// presence flags distinguish an omitted wildcard from an attempt to clear one.
type UpdateConversionRuleBody struct {
	EntitlementSlug *string               `json:"entitlementSlug,omitempty" nullable:"true"`
	ModelSlug       *string               `json:"modelSlug,omitempty" nullable:"true"`
	RequestType     *aicredit.RequestType `json:"requestType,omitempty" nullable:"true"`
	Pricing
	EntitlementSet bool `json:"-"`
	ModelSet       bool `json:"-"`
	RequestTypeSet bool `json:"-"`
}

func (c *UpdateConversionRuleBody) UnmarshalJSON(data []byte) error {
	type plain UpdateConversionRuleBody
	var decoded plain
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	*c = UpdateConversionRuleBody(decoded)
	_, c.EntitlementSet = fields["entitlementSlug"]
	_, c.ModelSet = fields["modelSlug"]
	_, c.RequestTypeSet = fields["requestType"]
	return nil
}

type Filter struct {
	Status          *schema.ConversionRuleStatus
	EntitlementSlug *string
	ModelSlug       *string
}

func (CreateConversionRuleBody) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	s.Properties["requestType"].Enum = append(s.Properties["requestType"].Enum, nil)
	return s
}
