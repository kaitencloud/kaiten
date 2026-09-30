package scope

import (
	"slices"
	"strings"
	"testing"
)

func TestReadAll(t *testing.T) {
	expected := "read:*"
	if got := ReadAll(); got != expected {
		t.Errorf("ReadAll() = %q, want %q", got, expected)
	}
}

func TestWriteAll(t *testing.T) {
	expected := "write:*"
	if got := WriteAll(); got != expected {
		t.Errorf("WriteAll() = %q, want %q", got, expected)
	}
}

func TestIsValidScope(t *testing.T) {
	tests := []struct {
		name     string
		scope    string
		expected bool
	}{
		// Valid scopes
		{"read wildcard", "read:*", true},
		{"write wildcard", "write:*", true},
		{"read licenses", "read:licenses", true},
		{"write licenses", "write:licenses", true},
		{"read feature_flags", "read:feature_flags", true},
		{"write instances", "write:instances", true},
		{"delete organizations", "delete:organizations", true},

		// Invalid scopes
		{"empty string", "", false},
		{"no colon", "readlicenses", false},
		{"invalid action", "archive:licenses", false},
		{"invalid module", "read:invalid_module", false},
		{"empty action", ":licenses", false},
		{"empty module", "read:", false},
		{"too many colons", "read:licenses:extra", false},
		{"spaces only action", " :licenses", false},
		{"spaces only module", "read: ", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsValidScope(tt.scope); got != tt.expected {
				t.Errorf("IsValidScope(%q) = %v, want %v", tt.scope, got, tt.expected)
			}
		})
	}
}

func TestValidateScopes(t *testing.T) {
	tests := []struct {
		name        string
		scopes      []string
		expectError bool
	}{
		{"valid single scope", []string{"read:licenses"}, false},
		{"valid multiple scopes", []string{"read:licenses", "write:instances"}, false},
		{"valid wildcard scopes", []string{"read:*", "write:*"}, false},
		{"mixed valid scopes", []string{"read:*", "write:licenses"}, false},
		{"invalid single scope", []string{"invalid:scope"}, true},
		{"mixed valid and invalid", []string{"read:licenses", "invalid:scope"}, true},
		{"empty scopes", []string{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateScopes(tt.scopes)
			if (err != nil) != tt.expectError {
				t.Errorf("ValidateScopes(%v) error = %v, expectError = %v", tt.scopes, err, tt.expectError)
			}
		})
	}
}

func TestHasScope(t *testing.T) {
	tests := []struct {
		name       string
		userScopes []string
		required   string
		expected   bool
	}{
		// Exact match
		{"exact match read", []string{"read:licenses"}, "read:licenses", true},
		{"exact match write", []string{"write:licenses"}, "write:licenses", true},

		// Write implies read
		{"write implies read", []string{"write:licenses"}, "read:licenses", true},
		{"read does not imply write", []string{"read:licenses"}, "write:licenses", false},

		// Wildcard read:*
		{"read:* grants read:licenses", []string{"read:*"}, "read:licenses", true},
		{"read:* grants read:instances", []string{"read:*"}, "read:instances", true},
		{"read:* does not grant write", []string{"read:*"}, "write:licenses", false},

		// Wildcard write:*
		{"write:* grants write:licenses", []string{"write:*"}, "write:licenses", true},
		{"write:* grants read:licenses", []string{"write:*"}, "read:licenses", true},
		{"write:* grants any write", []string{"write:*"}, "write:instances", true},
		{"write:* grants any read", []string{"write:*"}, "read:instances", true},

		// Multiple scopes
		{"multiple scopes with match", []string{"read:licenses", "write:instances"}, "read:licenses", true},
		{"multiple scopes without match", []string{"read:licenses", "write:instances"}, "read:customers", false},

		// Edge cases
		{"empty user scopes", []string{}, "read:licenses", false},
		{"no match", []string{"read:instances"}, "read:licenses", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := HasScope(tt.userScopes, tt.required); got != tt.expected {
				t.Errorf("HasScope(%v, %q) = %v, want %v", tt.userScopes, tt.required, got, tt.expected)
			}
		})
	}
}

func TestHasAllScopes(t *testing.T) {
	tests := []struct {
		name       string
		userScopes []string
		required   []string
		expected   bool
	}{
		// All match
		{"all exact match", []string{"read:licenses", "write:instances"}, []string{"read:licenses", "write:instances"}, true},
		{"write implies read in all", []string{"write:licenses", "write:instances"}, []string{"read:licenses", "read:instances"}, true},

		// Wildcards
		{"write:* grants all", []string{"write:*"}, []string{"read:licenses", "write:instances", "read:customers"}, true},
		{"read:* grants all reads", []string{"read:*"}, []string{"read:licenses", "read:instances"}, true},
		{"read:* does not grant writes", []string{"read:*"}, []string{"read:licenses", "write:instances"}, false},

		// Partial match
		{"missing one scope", []string{"read:licenses"}, []string{"read:licenses", "read:instances"}, false},
		{"empty required", []string{"read:licenses"}, []string{}, true},
		{"empty user scopes", []string{}, []string{"read:licenses"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := HasAllScopes(tt.userScopes, tt.required); got != tt.expected {
				t.Errorf("HasAllScopes(%v, %v) = %v, want %v", tt.userScopes, tt.required, got, tt.expected)
			}
		})
	}
}

func TestOrganizationScopes(t *testing.T) {
	scopes := OrganizationScopes()

	if !slices.IsSorted(scopes) {
		t.Errorf("OrganizationScopes() is not sorted: %v", scopes)
	}

	for _, s := range scopes {
		if !IsValidScope(s) {
			t.Errorf("OrganizationScopes() offers %q, which ValidateScopes would refuse at mint", s)
		}
		if strings.HasPrefix(s, "delete:") {
			t.Errorf("OrganizationScopes() offers %q: only Platform operations require a delete scope", s)
		}
	}

	// Enforced by the outbound webhooks service rather than by a Core operation, which is exactly why
	// the list cannot be read off the Core document's operations.
	for _, want := range []string{Read(Webhooks), Write(Webhooks)} {
		if !slices.Contains(scopes, want) {
			t.Errorf("OrganizationScopes() is missing %q", want)
		}
	}

	for _, module := range []Module{Users, Memberships} {
		for _, s := range []string{Read(module), Write(module)} {
			if slices.Contains(scopes, s) {
				t.Errorf("OrganizationScopes() offers %q, which only the Platform API enforces", s)
			}
		}
	}

	if want := 2 * len(OrganizationModules()); len(scopes) != want {
		t.Errorf("OrganizationScopes() has %d scopes, want read and write on each organization module (%d)", len(scopes), want)
	}
}
