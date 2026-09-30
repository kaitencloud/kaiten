package upsertintegration

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func strPtr(s string) *string { return &s }

// TestResolveSlug locks in the field-resolution rule shared by both the
// customer and instance upsert paths: an explicit slug must pass slug
// validation, while an absent one falls back to a generated-unique slug
// derived from the resource name.
func TestResolveSlug(t *testing.T) {
	t.Run("nil requested slug generates a unique slug from the name", func(t *testing.T) {
		got, err := resolveSlug("Acme Corp", nil, "Test.InvalidSlug")
		if err != nil {
			t.Fatalf("resolveSlug() unexpected error: %v", err)
		}
		if !strings.HasPrefix(got, "acme-corp-") {
			t.Errorf("resolveSlug(nil) = %q, want prefix %q", got, "acme-corp-")
		}
	})

	t.Run("valid explicit slug is trimmed and returned as-is", func(t *testing.T) {
		requested := "  my-custom-slug  "
		got, err := resolveSlug("Acme Corp", &requested, "Test.InvalidSlug")
		if err != nil {
			t.Fatalf("resolveSlug() unexpected error: %v", err)
		}
		if got != "my-custom-slug" {
			t.Errorf("resolveSlug() = %q, want %q", got, "my-custom-slug")
		}
	})

	t.Run("invalid explicit slug is rejected with the given error code", func(t *testing.T) {
		requested := "Invalid Slug!"
		_, err := resolveSlug("Acme Corp", &requested, "Test.InvalidSlug")
		if err == nil {
			t.Fatal("resolveSlug() error = nil, want validation error")
		}
		if !kaitenerrors.IsValidation(err) {
			t.Errorf("resolveSlug() error kind = %v, want Validation", err)
		}
		if kaitenerrors.GetCode(err) != "Test.InvalidSlug" {
			t.Errorf("resolveSlug() error code = %q, want %q", kaitenerrors.GetCode(err), "Test.InvalidSlug")
		}
	})

	t.Run("empty explicit slug (after trim) is rejected, not silently generated", func(t *testing.T) {
		requested := "   "
		_, err := resolveSlug("Acme Corp", &requested, "Test.InvalidSlug")
		if err == nil {
			t.Fatal("resolveSlug() error = nil, want validation error for blank explicit slug")
		}
		if !kaitenerrors.IsValidation(err) {
			t.Errorf("resolveSlug() error kind = %v, want Validation", err)
		}
	})

	t.Run("too-short explicit slug is rejected", func(t *testing.T) {
		requested := "a"
		_, err := resolveSlug("Acme Corp", &requested, "Test.InvalidSlug")
		if err == nil {
			t.Fatal("resolveSlug() error = nil, want validation error for a 1-char slug")
		}
	})
}

func TestRequiredTrimmedString(t *testing.T) {
	tests := []struct {
		name    string
		value   *string
		want    string
		wantErr bool
	}{
		{name: "nil value is rejected", value: nil, wantErr: true},
		{name: "empty value is rejected", value: strPtr(""), wantErr: true},
		{name: "whitespace-only value is rejected", value: strPtr("   "), wantErr: true},
		{name: "valid value is trimmed", value: strPtr("  hello  "), want: "hello"},
		{name: "valid value with no surrounding space is unchanged", value: strPtr("hello"), want: "hello"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := requiredTrimmedString(tt.value, "Test.Required", "value is required")
			if tt.wantErr {
				if err == nil {
					t.Fatal("requiredTrimmedString() error = nil, want error")
				}
				if kaitenerrors.GetCode(err) != "Test.Required" {
					t.Errorf("requiredTrimmedString() error code = %q, want %q", kaitenerrors.GetCode(err), "Test.Required")
				}
				return
			}
			if err != nil {
				t.Fatalf("requiredTrimmedString() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("requiredTrimmedString() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestRequiredUUID(t *testing.T) {
	t.Run("nil value is rejected", func(t *testing.T) {
		_, err := requiredUUID(nil, "Test.Required", "id is required")
		if err == nil {
			t.Fatal("requiredUUID() error = nil, want error")
		}
		if kaitenerrors.GetCode(err) != "Test.Required" {
			t.Errorf("requiredUUID() error code = %q, want %q", kaitenerrors.GetCode(err), "Test.Required")
		}
	})

	t.Run("non-nil value is returned unchanged", func(t *testing.T) {
		id := uuid.New()
		got, err := requiredUUID(&id, "Test.Required", "id is required")
		if err != nil {
			t.Fatalf("requiredUUID() unexpected error: %v", err)
		}
		if got != id {
			t.Errorf("requiredUUID() = %v, want %v", got, id)
		}
	})

	t.Run("pointer to the nil UUID is accepted (only a missing pointer is rejected)", func(t *testing.T) {
		nilID := uuid.Nil
		got, err := requiredUUID(&nilID, "Test.Required", "id is required")
		if err != nil {
			t.Fatalf("requiredUUID() unexpected error: %v", err)
		}
		if got != uuid.Nil {
			t.Errorf("requiredUUID() = %v, want %v", got, uuid.Nil)
		}
	})
}

func TestRequiredTime(t *testing.T) {
	t.Run("nil value is rejected", func(t *testing.T) {
		_, err := requiredTime(nil, "Test.Required", "date is required")
		if err == nil {
			t.Fatal("requiredTime() error = nil, want error")
		}
	})

	t.Run("zero-value time is rejected even when the pointer is non-nil", func(t *testing.T) {
		zero := time.Time{}
		_, err := requiredTime(&zero, "Test.Required", "date is required")
		if err == nil {
			t.Fatal("requiredTime() error = nil, want error for zero time")
		}
		if kaitenerrors.GetCode(err) != "Test.Required" {
			t.Errorf("requiredTime() error code = %q, want %q", kaitenerrors.GetCode(err), "Test.Required")
		}
	})

	t.Run("valid non-zero time is returned unchanged", func(t *testing.T) {
		want := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
		got, err := requiredTime(&want, "Test.Required", "date is required")
		if err != nil {
			t.Fatalf("requiredTime() unexpected error: %v", err)
		}
		if !got.Equal(want) {
			t.Errorf("requiredTime() = %v, want %v", got, want)
		}
	})
}

func TestNormalizeOptionalField(t *testing.T) {
	tests := []struct {
		name  string
		value *string
		want  *string
	}{
		{name: "nil value stays nil", value: nil, want: nil},
		{name: "empty value becomes nil, which is how a patch clears the field", value: strPtr(""), want: nil},
		{name: "whitespace-only value becomes nil", value: strPtr("   "), want: nil},
		{name: "valid value is trimmed", value: strPtr("  example.com  "), want: strPtr("example.com")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeOptionalField(tt.value)
			assertOptionalStringEqual(t, "normalizeOptionalField", got, tt.want)
		})
	}
}

func TestNormalizeJSONObject(t *testing.T) {
	t.Run("nil map becomes an empty, non-nil map", func(t *testing.T) {
		got := normalizeJSONObject(nil)
		if got == nil {
			t.Fatal("normalizeJSONObject(nil) = nil, want empty map")
		}
		if len(got) != 0 {
			t.Errorf("normalizeJSONObject(nil) = %#v, want empty map", got)
		}
	})

	t.Run("non-nil map is returned unchanged", func(t *testing.T) {
		in := map[string]any{"key": "value"}
		got := normalizeJSONObject(in)
		if len(got) != 1 || got["key"] != "value" {
			t.Errorf("normalizeJSONObject(%v) = %v, want unchanged", in, got)
		}
	})
}

func assertOptionalStringEqual(t *testing.T, fn string, got, want *string) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Errorf("%s() = %q, want nil", fn, *got)
		}
		return
	}
	if got == nil {
		t.Fatalf("%s() = nil, want %q", fn, *want)
	}
	if *got != *want {
		t.Errorf("%s() = %q, want %q", fn, *got, *want)
	}
}
