package usage

import "testing"

func TestGate(t *testing.T) {
	hard := Limit{Threshold: 10, OveragePercent: 0}
	soft := Limit{Threshold: 10, OveragePercent: 50} // maximum 15
	unlimited := Limit{Threshold: -1, OveragePercent: -1}
	tests := []struct {
		name     string
		limit    Limit
		after    float64
		reserved float64
		want     bool
	}{
		{"hard, under", hard, 9, 0, true},
		{"hard, exactly at the threshold", hard, 10, 0, true},
		{"hard, over", hard, 10.01, 0, false},
		{"hard, reserved pushes it over", hard, 8, 2.5, false},
		{"hard, reserved fills it exactly", hard, 8, 2, true},
		{"soft, over the threshold, under the maximum", soft, 14, 0, true},
		{"soft, exactly at the maximum", soft, 15, 0, true},
		{"soft, over the maximum", soft, 15.5, 0, false},
		{"soft, reserved pushes it over the maximum", soft, 14, 1.5, false},
		{"unlimited, anything", unlimited, 1e12, 0, true},
		{"unlimited, anything reserved", unlimited, 1e12, 1e12, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Gate(tt.limit, tt.after, tt.reserved); got != tt.want {
				t.Errorf("Gate(%+v, %v, %v) = %v, want %v", tt.limit, tt.after, tt.reserved, got, tt.want)
			}
		})
	}
}
