package schema_test

import (
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

func TestValidateWarningThresholdConfiguration(t *testing.T) {
	tests := []struct {
		name                    string
		entitlementType         schema.Type
		warningThresholdPercent *int32
		wantErr                 bool
	}{
		{"Number with no fields set", schema.Number, nil, false},
		{"Number with valid percent", schema.Number, ptr.To(int32(80)), false},
		{"Number with zero percent (disabled)", schema.Number, ptr.To(int32(0)), false},
		{"Number with hundred percent", schema.Number, ptr.To(int32(100)), false},
		{"Number with negative percent rejected", schema.Number, ptr.To(int32(-1)), true},
		{"Number with percent over 100 rejected", schema.Number, ptr.To(int32(101)), true},
		{"NumberAICredit with no percent set", schema.NumberAICredit, nil, false},
		{"NumberAICredit with valid percent", schema.NumberAICredit, ptr.To(int32(50)), false},
		{"Boolean with warningThresholdPercent rejected", schema.Boolean, ptr.To(int32(50)), true},
		{"Config with no fields set", schema.Config, nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := schema.ValidateWarningThresholdConfiguration(tt.entitlementType, tt.warningThresholdPercent)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateWarningThresholdConfiguration(%v, %v) error = %v, wantErr %v",
					tt.entitlementType, tt.warningThresholdPercent, err, tt.wantErr)
			}
		})
	}
}
