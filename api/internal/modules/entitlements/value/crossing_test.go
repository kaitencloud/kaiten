package value

import "testing"

func TestWarningBoundary(t *testing.T) {
	cases := []struct {
		name      string
		threshold float64
		percent   int32
		want      float64
	}{
		{"eighty percent of a thousand", 1000, 80, 800},
		{"zero percent disables to zero boundary", 1000, 0, 0},
		{"hundred percent equals the cap", 1000, 100, 1000},
		{"fifty percent of two hundred", 200, 50, 100},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := WarningBoundary(tc.threshold, tc.percent); got != tc.want {
				t.Errorf("WarningBoundary(%v, %v) = %v, want %v", tc.threshold, tc.percent, got, tc.want)
			}
		})
	}
}

func TestCrossed(t *testing.T) {
	cases := []struct {
		name     string
		previous float64
		updated  float64
		boundary float64
		want     bool
	}{
		{"below boundary stays below", 500, 700, 800, false},
		{"exactly reaching the boundary", 700, 800, 800, true},
		{"jumping over the boundary", 500, 1200, 800, true},
		{"already at boundary, staying above", 800, 900, 800, false},
		{"already above boundary, staying above", 900, 1200, 800, false},
		{"boundary is zero (disabled), previous also zero", 0, 5, 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Crossed(tc.previous, tc.updated, tc.boundary); got != tc.want {
				t.Errorf("Crossed(%v, %v, %v) = %v, want %v", tc.previous, tc.updated, tc.boundary, got, tc.want)
			}
		})
	}
}
