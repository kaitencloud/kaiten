package random

import (
	"strings"
	"testing"
)

func TestGeneratePrefixed(t *testing.T) {
	tests := []struct {
		name   string
		prefix string
		length int
	}{
		{"32 chars", "ksh_", 32},
		{"10 chars", "ksa_", 10},
		{"1 char", "x_", 1},
		{"100 chars", "test_", 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := GeneratePrefixed(tt.prefix, tt.length)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			withoutPrefix := strings.TrimPrefix(result, tt.prefix)
			if len(withoutPrefix) != tt.length {
				t.Errorf("expected %d chars, got %d (%s)", tt.length, len(withoutPrefix), withoutPrefix)
			}
		})
	}
}
