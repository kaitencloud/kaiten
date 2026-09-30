package validator_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/validator"
)

func newValidator(t *testing.T) *validator.Validator {
	t.Helper()
	return validator.NewValidator()
}

func boolVariants() []schema.Variant {
	return []schema.Variant{
		{Name: "on", Description: "On", Value: true},
		{Name: "off", Description: "Off", Value: false},
	}
}

func boolFlag(metadata map[string]any) *schema.FeatureFlag {
	v := schema.BasicVariant("on")
	return &schema.FeatureFlag{
		Name:     "test-flag",
		Type:     "boolean",
		Variants: boolVariants(),
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: &v,
		},
		Metadata: metadata,
	}
}

func TestValidator_MetadataFallbackValue_IsOptional(t *testing.T) {
	v := newValidator(t)

	t.Run("no metadata key — passes", func(t *testing.T) {
		require.NoError(t, v.ValidateFlag(boolFlag(map[string]any{})))
	})

	t.Run("nil metadata — passes", func(t *testing.T) {
		require.NoError(t, v.ValidateFlag(boolFlag(nil)))
	})

	t.Run("null value for key — passes", func(t *testing.T) {
		require.NoError(t, v.ValidateFlag(boolFlag(map[string]any{"fallback_value": nil})))
	})
}

func TestValidator_MetadataFallbackValue_TypeChecking(t *testing.T) {
	tests := []struct {
		name        string
		flagType    string
		fallback    any
		wantErr     bool
		errContains string
	}{
		// boolean
		{name: "boolean / bool fallback", flagType: "boolean", fallback: true, wantErr: false},
		{name: "boolean / string fallback", flagType: "boolean", fallback: "true", wantErr: true, errContains: "metadata fallback_value has type string but flag type is boolean"},
		{name: "boolean / number fallback", flagType: "boolean", fallback: float64(1), wantErr: true, errContains: "metadata fallback_value has type float64 but flag type is boolean"},
		// string
		{name: "string / string fallback", flagType: "string", fallback: "hello", wantErr: false},
		{name: "string / bool fallback", flagType: "string", fallback: false, wantErr: true, errContains: "metadata fallback_value has type bool but flag type is string"},
		{name: "string / number fallback", flagType: "string", fallback: float64(42), wantErr: true, errContains: "metadata fallback_value has type float64 but flag type is string"},
		// number
		{name: "number / int fallback", flagType: "number", fallback: 42, wantErr: false},
		{name: "number / float64 fallback", flagType: "number", fallback: float64(42), wantErr: false},
		{name: "number / float32 fallback", flagType: "number", fallback: float32(42.5), wantErr: false},
		{name: "number / bool fallback", flagType: "number", fallback: true, wantErr: true, errContains: "metadata fallback_value has type bool but flag type is number"},
		{name: "number / string fallback", flagType: "number", fallback: "42", wantErr: true, errContains: "metadata fallback_value has type string but flag type is number"},
		// object — any type accepted
		{name: "object / map fallback", flagType: "object", fallback: map[string]any{"key": "value"}, wantErr: false},
		{name: "object / string fallback", flagType: "object", fallback: "anything", wantErr: false},
		{name: "object / bool fallback", flagType: "object", fallback: true, wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := newValidator(t)

			var variants []schema.Variant
			var variantRef schema.BasicVariant
			switch tt.flagType {
			case "boolean":
				variants = boolVariants()
				variantRef = schema.BasicVariant("on")
			case "string":
				variants = []schema.Variant{{Name: "on", Description: "On", Value: "enabled"}}
				variantRef = schema.BasicVariant("on")
			case "number":
				variants = []schema.Variant{{Name: "on", Description: "On", Value: float64(1)}}
				variantRef = schema.BasicVariant("on")
			case "object":
				variants = []schema.Variant{{Name: "on", Description: "On", Value: map[string]any{"enabled": true}}}
				variantRef = schema.BasicVariant("on")
			}

			flag := &schema.FeatureFlag{
				Name:     "test-flag",
				Type:     tt.flagType,
				Variants: variants,
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: &variantRef,
				},
				Metadata: map[string]any{"fallback_value": tt.fallback},
			}

			err := v.ValidateFlag(flag)
			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errContains)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestValidator_NumberVariant_AcceptsIntegerAndFloat(t *testing.T) {
	v := newValidator(t)

	tests := []struct {
		name        string
		variant     any
		wantErr     bool
		errContains string
	}{
		{name: "int variant", variant: 1, wantErr: false},
		{name: "float variant", variant: 1.5, wantErr: false},
		{name: "string variant", variant: "1", wantErr: true, errContains: "variant \"on\" has type string but flag type is number"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ref := schema.BasicVariant("on")
			flag := &schema.FeatureFlag{
				Name: "number-flag",
				Type: "number",
				Variants: []schema.Variant{
					{Name: "on", Description: "On", Value: tt.variant},
				},
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: &ref,
				},
				Metadata: map[string]any{"fallback_value": 1},
			}

			err := v.ValidateFlag(flag)
			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errContains)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestValidator_MetadataFallbackValue_RolloutPercentage(t *testing.T) {
	v := newValidator(t)

	p := schema.RolloutPercentageVariant{
		RolloutPercentage: schema.RolloutPercentage{
			Distribution: map[string]int64{"on": 50, "off": 50},
		},
	}

	t.Run("valid bool fallback on boolean flag", func(t *testing.T) {
		flag := &schema.FeatureFlag{
			Name:     "test-flag",
			Type:     "boolean",
			Variants: boolVariants(),
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.RolloutPercentageType,
				Value: &p,
			},
			Metadata: map[string]any{"fallback_value": false},
		}
		require.NoError(t, v.ValidateFlag(flag))
	})

	t.Run("invalid string fallback on boolean flag", func(t *testing.T) {
		flag := &schema.FeatureFlag{
			Name:     "test-flag",
			Type:     "boolean",
			Variants: boolVariants(),
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.RolloutPercentageType,
				Value: &p,
			},
			Metadata: map[string]any{"fallback_value": "wrong"},
		}
		err := v.ValidateFlag(flag)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "metadata fallback_value has type string but flag type is boolean")
	})

	t.Run("absent fallback value — passes", func(t *testing.T) {
		flag := &schema.FeatureFlag{
			Name:     "test-flag",
			Type:     "boolean",
			Variants: boolVariants(),
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.RolloutPercentageType,
				Value: &p,
			},
			Metadata: map[string]any{},
		}
		require.NoError(t, v.ValidateFlag(flag))
	})
}
