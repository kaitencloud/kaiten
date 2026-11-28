package usage

import (
	"strings"
	"testing"
)

func TestValidResourceKey(t *testing.T) {
	tests := []struct {
		key  string
		want bool
	}{
		{"stigg", true},
		{"Stigg", true},
		{"x", true},
		{strings.Repeat("a", 128), true},
		{"A.b_c-d:9", true},
		{"comp:123", true},
		{"550e8400-e29b-41d4-a716-446655440000", true},
		{"...", true},
		{".hidden", true},
		{"a..b", true},
		{"..a", true},
		{"", false},
		{strings.Repeat("a", 129), false},
		{".", false},
		{"..", false},
		{"has space", false},
		{"a/b", false},
		{"a\\b", false},
		{"café", false},
		{"emoji\U0001F600", false},
		{"semi;colon", false},
		{"question?", false},
		{"percent%41", false},
		{"new\nline", false},
		{"trailing\n", false},
		{"tab\tinside", false},
	}
	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			if got := ValidResourceKey(tt.key); got != tt.want {
				t.Errorf("ValidResourceKey(%q) = %v, want %v", tt.key, got, tt.want)
			}
		})
	}
}

func TestDecodeResourceKey(t *testing.T) {
	tests := []struct {
		segment string
		want    string
		valid   bool
	}{
		{"stigg", "stigg", true},
		{"comp:123", "comp:123", true},
		{"comp%3A123", "comp:123", true},
		{"comp%3a123", "comp:123", true},
		{"a%2Fb", "a/b", false},
		{"a%20b", "a b", false},
		{"%2E%2E", "..", false},
		{"%2e", ".", false},
		{"%41", "A", true},
		{"%2541", "%41", false},
		{"bad%zz", "bad%zz", false},
		{"truncated%", "truncated%", false},
	}
	for _, tt := range tests {
		t.Run(tt.segment, func(t *testing.T) {
			got := DecodeResourceKey(tt.segment)
			if got != tt.want {
				t.Errorf("DecodeResourceKey(%q) = %q, want %q", tt.segment, got, tt.want)
			}
			if valid := ValidResourceKey(got); valid != tt.valid {
				t.Errorf("ValidResourceKey(DecodeResourceKey(%q)) = %v, want %v", tt.segment, valid, tt.valid)
			}
		})
	}
}
