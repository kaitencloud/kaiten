package server

import (
	"encoding/json"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAICreditGrantContractsPreserveDefinitionType(t *testing.T) {
	schemas := newContractDocument(t).Components.Schemas.Map()
	for _, item := range []struct{ name, property string }{
		{"LicenseEntitlement", "entitlementType"},
		{"PublicPlanEntitlement", "type"},
		{"PublicAddOnEntitlement", "type"},
	} {
		t.Run(item.name, func(t *testing.T) {
			require.NotNil(t, schemas[item.name])
			property := schemas[item.name].Properties[item.property]
			require.NotNil(t, property)
			assert.Contains(t, property.Enum, "NUMBER_AI_CREDIT")
			assert.Contains(t, property.Enum, "NUMBER")
			assert.NotContains(t, property.Enum, "AI_CREDITS", "the existing wire enum must not be renamed")
		})
	}
}

func TestAICalculatorInputExamplesDoNotChangeNumericReads(t *testing.T) {
	doc := newContractDocument(t)
	schemas := doc.Components.Schemas.Map()
	input := schemas["ReportEntitlementUsageBody"].Properties["value"]
	require.NotNil(t, input.Discriminator)
	assert.Contains(t, input.Discriminator.Mapping, "number")
	assert.Contains(t, input.Discriminator.Mapping, "ai_usage")
	assert.Contains(t, input.Description, "NUMBER_AI_CREDIT")

	read := schemas["EntitlementUsage"].Properties["value"]
	require.NotEmpty(t, read.OneOf)
	for _, variant := range read.OneOf {
		assert.NotEqual(t, "#/components/schemas/AiUsageValue", variant.Ref)
	}

	ai := schemas["AiUsageValue"]
	require.NotNil(t, ai)
	require.Len(t, ai.Examples, 2)
	for i, example := range ai.Examples {
		encoded, err := json.Marshal(example)
		require.NoError(t, err)
		var value map[string]any
		require.NoError(t, json.Unmarshal(encoded, &value))
		result := &huma.ValidateResult{}
		huma.Validate(doc.Components.Schemas, ai, huma.NewPathBuffer(nil, 0), huma.ModeWriteToServer, value, result)
		require.Empty(t, result.Errors)
		assert.Equal(t, "inference-001", value["transactionId"])
		if i == 0 {
			assert.Equal(t, "reserve", value["phase"])
			assert.NotContains(t, value, "requestStatus")
		} else {
			assert.Equal(t, "commit", value["phase"])
			assert.Equal(t, "SUCCESS", value["requestStatus"])
		}
	}
}
