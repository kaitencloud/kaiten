package usage

import (
	"slices"
	"testing"
)

func TestCrossings(t *testing.T) {
	hard := Limit{Threshold: 10, OveragePercent: 0}
	soft := Limit{Threshold: 10, OveragePercent: 50}
	tests := []struct {
		name           string
		limit          Limit
		warningPercent int32
		before, after  float64
		want           []Crossing
	}{
		{"below everything", hard, 80, 1, 7, nil},
		{"warning, exactly on the boundary", hard, 80, 7, 8, []Crossing{{Warning, 8}}},
		{"warning, jumping past it", hard, 80, 7, 9, []Crossing{{Warning, 8}}},
		{"warning, already past it", hard, 80, 8, 9, nil},
		{"warning disabled", hard, 0, 1, 9, nil},
		{"exact reach, with the warning", hard, 80, 7, 10, []Crossing{{Reached, 10}, {Warning, 8}}},
		{"exact reach fires again from the threshold", hard, 80, 10, 10, []Crossing{{Reached, 10}}},
		{"cap exceeded once, with the warning", soft, 80, 7, 12, []Crossing{{CapExceeded, 10}, {Warning, 8}}},
		{"cap already exceeded", soft, 80, 12, 13, nil},
		{"leaving the cap from exactly on it", soft, 0, 10, 11, nil},
		{"unlimited never crosses", Limit{Threshold: -1, OveragePercent: -1}, 80, 0, 1e9, nil},
		{"downward set crosses nothing", soft, 80, 12, 2, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Crossings(tt.limit, tt.warningPercent, tt.before, tt.after)
			if !slices.Equal(got, tt.want) {
				t.Errorf("Crossings() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
