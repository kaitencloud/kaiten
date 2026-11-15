package schema

import (
	"reflect"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/require"
)

func TestConversionRuleNullableWireSchema(t *testing.T) {
	registry := huma.NewMapRegistry("#/components/schemas/", huma.DefaultSchemaNamer)
	rule := huma.SchemaFromType(registry, reflect.TypeFor[ConversionRule]())
	require.True(t, rule.Properties["requestType"].Nullable)
	require.Contains(t, rule.Properties["requestType"].Enum, any(nil))
	rates := huma.SchemaFromType(registry, reflect.TypeFor[ConversionRates]())
	for _, field := range []string{"perRequest", "perInputToken", "perCachedInputToken", "perCacheWriteToken", "perOutputToken", "perUnit", "perSecond"} {
		require.True(t, rates.Properties[field].Nullable)
	}
}
