package slugutil

import (
	"strings"
	"testing"
)

func TestGenerate(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "simple lowercase", in: "hello", want: "hello"},
		{name: "uppercase is lowered", in: "Hello World", want: "hello-world"},
		{name: "multiple spaces collapse to one hyphen", in: "hello   world", want: "hello-world"},
		{name: "punctuation collapses to hyphen", in: "Acme, Inc.", want: "acme-inc"},
		{name: "leading and trailing punctuation trimmed", in: "--Acme--", want: "acme"},
		{name: "leading and trailing spaces trimmed", in: "  acme  ", want: "acme"},
		{name: "digits are preserved", in: "Customer 42", want: "customer-42"},
		{name: "already a valid slug is unchanged", in: "already-a-slug", want: "already-a-slug"},
		{name: "empty string produces empty slug", in: "", want: ""},
		{name: "only punctuation produces empty slug", in: "!!!", want: ""},
		{name: "accents are dropped", in: "café", want: "cafe"},
		{name: "accents are dropped across words", in: "Société Générale", want: "societe-generale"},
		{name: "letters without a mark are spelled out", in: "Œuvre Straße Øresund", want: "oeuvre-strasse-oresund"},
		{name: "apostrophes are dropped, not turned into separators", in: "L'Oréal", want: "loreal"},
		{name: "curly apostrophes are dropped too", in: "Kevin’s Shop", want: "kevins-shop"},
		{name: "version dots become hyphens", in: "v0.1.0", want: "v0-1-0"},
		{name: "non-Latin letters leave nothing to keep", in: "株式会社", want: ""},
		{name: "consecutive separators of different kinds collapse", in: "a__b--c  d", want: "a-b-c-d"},
		{name: "underscore treated as separator", in: "foo_bar_baz", want: "foo-bar-baz"},
		{name: "slash treated as separator", in: "foo/bar", want: "foo-bar"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Generate(tt.in); got != tt.want {
				t.Errorf("Generate(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestGenerateUnique(t *testing.T) {
	t.Run("appends a 6 hex char suffix separated by a hyphen", func(t *testing.T) {
		got, err := GenerateUnique("Acme Corp")
		if err != nil {
			t.Fatalf("GenerateUnique returned error: %v", err)
		}

		wantPrefix := "acme-corp-"
		if !strings.HasPrefix(got, wantPrefix) {
			t.Fatalf("GenerateUnique(%q) = %q, want prefix %q", "Acme Corp", got, wantPrefix)
		}

		suffix := strings.TrimPrefix(got, wantPrefix)
		if len(suffix) != 6 {
			t.Errorf("GenerateUnique(%q) suffix = %q, want length 6, got length %d", "Acme Corp", suffix, len(suffix))
		}
		for _, r := range suffix {
			isHex := (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')
			if !isHex {
				t.Errorf("GenerateUnique(%q) suffix %q contains non-hex character %q", "Acme Corp", suffix, r)
			}
		}
	})

	t.Run("a name with nothing to keep gets the bare suffix, a valid slug", func(t *testing.T) {
		for _, in := range []string{"", "株式会社"} {
			got, err := GenerateUnique(in)
			if err != nil {
				t.Fatalf("GenerateUnique returned error: %v", err)
			}
			if len(got) != 6 {
				t.Errorf("GenerateUnique(%q) = %q, want the 6 hex chars alone, got length %d", in, got, len(got))
			}
			if !Validate(got) {
				t.Errorf("GenerateUnique(%q) = %q, want a valid slug", in, got)
			}
		}
	})

	t.Run("two calls with the same input produce different suffixes", func(t *testing.T) {
		first, err := GenerateUnique("same-name")
		if err != nil {
			t.Fatalf("GenerateUnique returned error: %v", err)
		}
		second, err := GenerateUnique("same-name")
		if err != nil {
			t.Fatalf("GenerateUnique returned error: %v", err)
		}
		if first == second {
			t.Errorf("GenerateUnique(%q) produced the same value twice: %q -- suffix should be random per call", "same-name", first)
		}
	})
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{name: "simple valid slug", in: "hello-world", want: true},
		{name: "single word valid slug", in: "hello", want: true},
		{name: "alphanumeric valid slug", in: "abc123", want: true},
		{name: "minimum length two chars is valid", in: "ab", want: true},
		{name: "single character is too short", in: "a", want: false},
		{name: "empty string is invalid", in: "", want: false},
		{name: "uppercase letters are invalid", in: "Hello-World", want: false},
		{name: "leading hyphen is invalid", in: "-hello", want: false},
		{name: "trailing hyphen is invalid", in: "hello-", want: false},
		{name: "only hyphens is invalid", in: "--", want: false},
		{name: "consecutive interior hyphens are valid", in: "hello--world", want: true},
		{name: "underscore is invalid", in: "hello_world", want: false},
		{name: "space is invalid", in: "hello world", want: false},
		{name: "unicode is invalid", in: "café-shop", want: false},
		{name: "exactly 100 chars is valid", in: strings.Repeat("a", 100), want: true},
		{name: "101 chars is too long", in: strings.Repeat("a", 101), want: false},
		{name: "dot is invalid", in: "hello.world", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Validate(tt.in); got != tt.want {
				t.Errorf("Validate(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
