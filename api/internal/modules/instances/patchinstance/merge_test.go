package patchinstance

import (
	"reflect"
	"testing"
)

func TestMergeMetadata(t *testing.T) {
	stored := map[string]any{
		"region":  "eu",
		"betas":   []any{"a", "b"},
		"limits":  map[string]any{"seats": float64(5), "sso": true},
		"retired": "x",
	}

	got := mergeMetadata(stored, map[string]any{
		"betas":   []any{"c"},                          // a list is replaced whole
		"limits":  map[string]any{"seats": float64(9)}, // so is an object
		"retired": nil,                                 // null removes the key
		"tier":    "gold",                              // a new key is set
	})

	want := map[string]any{
		"region": "eu", // absent from the patch: kept
		"betas":  []any{"c"},
		"limits": map[string]any{"seats": float64(9)},
		"tier":   "gold",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("merge = %#v, want %#v", got, want)
	}
	if stored["retired"] != "x" || len(stored) != 4 {
		t.Fatalf("stored metadata was modified: %#v", stored)
	}
}

func TestMergeMetadataOnEmptyStored(t *testing.T) {
	got := mergeMetadata(nil, map[string]any{"a": "1", "gone": nil})
	if !reflect.DeepEqual(got, map[string]any{"a": "1"}) {
		t.Fatalf("merge = %#v", got)
	}
}
