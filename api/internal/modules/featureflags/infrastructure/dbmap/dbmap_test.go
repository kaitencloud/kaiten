package dbmap_test

import (
	"encoding/json"
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/dbmap"
)

// TestToFeatureFlagMetadata pins what the API answers for each shape the
// metadata column holds. The contract declares metadata a required object and
// the console reads it as one: the demo seed's flags stored the JSON null, and
// their detail page crashed reading metadata.owner.
func TestToFeatureFlagMetadata(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		stored string
		want   string
	}{
		{"JSON null", `null`, `{}`},
		{"empty object", `{}`, `{}`},
		{"object", `{"owner":"growth"}`, `{"owner":"growth"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			flag, err := dbmap.ToFeatureFlag(db.FeatureFlag{
				Type:           "boolean",
				Variants:       []byte(`[]`),
				TargetingRules: []byte(`[]`),
				Metadata:       []byte(tt.stored),
				DefaultVariant: []byte(`{"type":"basic","value":"off"}`),
			})
			if err != nil {
				t.Fatalf("ToFeatureFlag() error = %v, want nil", err)
			}

			encoded, err := json.Marshal(flag)
			if err != nil {
				t.Fatalf("json.Marshal(flag) error = %v", err)
			}
			var body map[string]json.RawMessage
			if err := json.Unmarshal(encoded, &body); err != nil {
				t.Fatalf("json.Unmarshal(response) error = %v", err)
			}
			if got := string(body["metadata"]); got != tt.want {
				t.Errorf("metadata stored as %s is answered as %s, want %s", tt.stored, got, tt.want)
			}
		})
	}
}

// TestMetadataColumn pins what the create and update repositories write, so a
// flag built in process with no metadata stops adding null rows.
func TestMetadataColumn(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		metadata map[string]any
		want     string
	}{
		{"nil", nil, `{}`},
		{"empty", map[string]any{}, `{}`},
		{"set", map[string]any{"owner": "growth"}, `{"owner":"growth"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := dbmap.MetadataColumn(tt.metadata)
			if err != nil {
				t.Fatalf("MetadataColumn(%v) error = %v, want nil", tt.metadata, err)
			}
			if string(got) != tt.want {
				t.Errorf("MetadataColumn(%v) = %s, want %s", tt.metadata, got, tt.want)
			}
		})
	}
}
