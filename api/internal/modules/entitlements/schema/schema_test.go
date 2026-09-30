package schema_test

import (
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

func isValidType(val schema.Type) bool {
	return val == schema.Boolean || val == schema.Number || val == schema.Config
}

func isValidAggregationMethod(val schema.AggregationMethod) bool {
	switch val {
	case schema.Count, schema.Sum, schema.Average, schema.Min, schema.Max, schema.Latest:
		return true
	default:
		return false
	}
}

func TestType_Validation(t *testing.T) {
	tests := []struct {
		name string
		val  schema.Type
		want bool
	}{
		{"Valid Boolean", schema.Boolean, true},
		{"Valid Number", schema.Number, true},
		{"Valid Config", schema.Config, true},
		{"Invalid Empty", "", false},
		{"Invalid random string", "INVALID", false},
		{"Invalid lowercase boolean", "boolean", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidType(tt.val)
			if got != tt.want {
				t.Errorf("Type validation = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAggregationMethod_Validation(t *testing.T) {
	tests := []struct {
		name string
		val  schema.AggregationMethod
		want bool
	}{
		{"Valid Count", schema.Count, true},
		{"Valid Sum", schema.Sum, true},
		{"Valid Average", schema.Average, true},
		{"Valid Min", schema.Min, true},
		{"Valid Max", schema.Max, true},
		{"Valid Latest", schema.Latest, true},
		{"Invalid Empty", "", false},
		{"Invalid random string", "INVALID", false},
		{"Invalid lowercase sum", "sum", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidAggregationMethod(tt.val)
			if got != tt.want {
				t.Errorf("AggregationMethod validation = %v, want %v", got, tt.want)
			}
		})
	}
}
