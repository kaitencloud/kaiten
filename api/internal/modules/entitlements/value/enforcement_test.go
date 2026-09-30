package value

import "testing"

func TestValidateLimitCapExceededOveragePercent(t *testing.T) {
	cases := []struct {
		name           string
		threshold      float64
		overagePercent int32
		wantErr        bool
	}{
		{"unlimited threshold with -1 overage is valid", -1, -1, false},
		{"unlimited threshold with 0 overage is rejected", -1, 0, true},
		{"unlimited threshold with positive overage is rejected", -1, 10, true},
		{"unlimited threshold with other negative overage is rejected", -1, -2, true},
		{"limited threshold with 0 overage (hard) is valid", 100, 0, false},
		{"limited threshold with positive overage (soft) is valid", 100, 20, false},
		{"limited threshold with -1 overage is rejected", 100, -1, true},
		{"limited threshold with other negative overage is rejected", 100, -5, true},
		{"zero threshold with 0 overage is valid", 0, 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateLimitCapExceededOveragePercent(tc.threshold, tc.overagePercent)
			if (err != nil) != tc.wantErr {
				t.Errorf("ValidateLimitCapExceededOveragePercent(%v, %v) error = %v, wantErr %v",
					tc.threshold, tc.overagePercent, err, tc.wantErr)
			}
		})
	}
}

func TestDefaultLimitCapExceededOveragePercent(t *testing.T) {
	cases := []struct {
		name      string
		threshold float64
		want      int32
	}{
		{"unlimited threshold defaults to -1", -1, -1},
		{"limited threshold defaults to hard (0)", 100, 0},
		{"zero threshold defaults to hard (0)", 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DefaultLimitCapExceededOveragePercent(tc.threshold); got != tc.want {
				t.Errorf("DefaultLimitCapExceededOveragePercent(%v) = %v, want %v", tc.threshold, got, tc.want)
			}
		})
	}
}

func TestIsHardLimitAndIsSoftLimit(t *testing.T) {
	cases := []struct {
		name           string
		threshold      float64
		overagePercent int32
		wantHard       bool
		wantSoft       bool
	}{
		{"unlimited is neither hard nor soft", -1, -1, false, false},
		{"zero overage on a limited threshold is hard", 100, 0, true, false},
		{"positive overage on a limited threshold is soft", 100, 10, false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsHardLimit(tc.threshold, tc.overagePercent); got != tc.wantHard {
				t.Errorf("IsHardLimit(%v, %v) = %v, want %v", tc.threshold, tc.overagePercent, got, tc.wantHard)
			}
			if got := IsSoftLimit(tc.threshold, tc.overagePercent); got != tc.wantSoft {
				t.Errorf("IsSoftLimit(%v, %v) = %v, want %v", tc.threshold, tc.overagePercent, got, tc.wantSoft)
			}
		})
	}
}

// TestMaximumAllowedUsage proves the percentage is always calculated from
// the entitlement's own configured threshold, never from any usage figure --
// MaximumAllowedUsage takes no usage argument at all, only threshold and
// overagePercent.
func TestMaximumAllowedUsage(t *testing.T) {
	cases := []struct {
		name           string
		threshold      float64
		overagePercent int32
		want           float64
	}{
		{"zero overage equals the threshold (hard limit)", 100, 0, 100},
		{"ten percent overage of a hundred", 100, 10, 110},
		{"twenty percent overage of two-fifty", 250, 20, 300},
		{"fifty percent overage of two hundred", 200, 50, 300},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := MaximumAllowedUsage(tc.threshold, tc.overagePercent); got != tc.want {
				t.Errorf("MaximumAllowedUsage(%v, %v) = %v, want %v", tc.threshold, tc.overagePercent, got, tc.want)
			}
		})
	}
}
