package validator

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// composeSchema is a small helper that builds the composed schema bytes for
// a single field declaration, in either strict or tolerant mode. Keeps the
// table tests below readable.
func composeSchema(t *testing.T, key, schemaJSON string, isStrict bool) []byte {
	t.Helper()
	out, err := BuildResourceSchema([]db.MetadataField{mkField(key, schemaJSON)}, isStrict)
	require.NoError(t, err)
	return out
}

// TestValidateMetadata walks the cartesian product the ticket calls out:
// 6 UI types × 2 modes (strict/tolerant) × 3 cases (valid / invalid / edge).
// It's not exhaustive — that role is held by ValidateSchemaShape /
// BuildResourceSchema tests — but it locks down the contract.
func TestValidateMetadata(t *testing.T) {
	t.Parallel()

	type tc struct {
		name     string
		key      string
		schema   string
		isStrict bool
		input    map[string]any
		wantOK   bool
		wantCode string
	}

	cases := []tc{
		// --- STRING ---
		{
			name: "STRING strict valid", key: "region", schema: `{"type":"string"}`, isStrict: true,
			input: map[string]any{"region": "eu-west-1"}, wantOK: true,
		},
		{
			name: "STRING strict invalid (number)", key: "region", schema: `{"type":"string"}`, isStrict: true,
			input: map[string]any{"region": 42}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "STRING tolerant: unknown key accepted", key: "region", schema: `{"type":"string"}`, isStrict: false,
			input: map[string]any{"region": "eu", "extra": "yes"}, wantOK: true,
		},
		{
			name: "STRING strict: unknown key rejected", key: "region", schema: `{"type":"string"}`, isStrict: true,
			input: map[string]any{"region": "eu", "extra": "yes"}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "STRING strict: missing key (optional by default)", key: "region", schema: `{"type":"string"}`, isStrict: true,
			input: map[string]any{}, wantOK: true,
		},

		// --- NUMBER ---
		{
			name: "NUMBER strict valid", key: "weight", schema: `{"type":"number"}`, isStrict: true,
			input: map[string]any{"weight": 3.14}, wantOK: true,
		},
		{
			name: "NUMBER strict invalid (string)", key: "weight", schema: `{"type":"number"}`, isStrict: true,
			input: map[string]any{"weight": "3.14"}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "NUMBER edge: integer accepted", key: "weight", schema: `{"type":"number"}`, isStrict: true,
			input: map[string]any{"weight": 7}, wantOK: true,
		},

		// --- BOOLEAN ---
		{
			name: "BOOLEAN strict valid true", key: "enabled", schema: `{"type":"boolean"}`, isStrict: true,
			input: map[string]any{"enabled": true}, wantOK: true,
		},
		{
			name: "BOOLEAN strict invalid (string)", key: "enabled", schema: `{"type":"boolean"}`, isStrict: true,
			input: map[string]any{"enabled": "true"}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "BOOLEAN strict valid false", key: "enabled", schema: `{"type":"boolean"}`, isStrict: true,
			input: map[string]any{"enabled": false}, wantOK: true,
		},

		// --- ENUM ---
		{
			name: "ENUM strict in set", key: "tier", schema: `{"type":"string","enum":["a","b"]}`, isStrict: true,
			input: map[string]any{"tier": "a"}, wantOK: true,
		},
		{
			name: "ENUM strict out of set", key: "tier", schema: `{"type":"string","enum":["a","b"]}`, isStrict: true,
			input: map[string]any{"tier": "WRONG"}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "ENUM tolerant out of set still rejected", key: "tier", schema: `{"type":"string","enum":["a","b"]}`, isStrict: false,
			input: map[string]any{"tier": "WRONG"}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},

		// --- ENUM_LIST (array of enum) ---
		{
			name: "ENUM_LIST strict valid", key: "labels",
			schema: `{"type":"array","items":{"type":"string","enum":["x","y"]},"uniqueItems":true}`, isStrict: true,
			input: map[string]any{"labels": []any{"x", "y"}}, wantOK: true,
		},
		{
			name: "ENUM_LIST strict invalid value", key: "labels",
			schema: `{"type":"array","items":{"type":"string","enum":["x","y"]},"uniqueItems":true}`, isStrict: true,
			input: map[string]any{"labels": []any{"x", "BAD"}}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "ENUM_LIST strict duplicate rejected by uniqueItems", key: "labels",
			schema: `{"type":"array","items":{"type":"string","enum":["x","y"]},"uniqueItems":true}`, isStrict: true,
			input: map[string]any{"labels": []any{"x", "x"}}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "ENUM_LIST accepts Go-native string slices", key: "labels",
			schema: `{"type":"array","items":{"type":"string","enum":["x","y"]},"uniqueItems":true}`, isStrict: true,
			input: map[string]any{"labels": []string{"x", "y"}}, wantOK: true,
		},

		// --- DATE ---
		{
			name: "DATE strict valid", key: "go_live", schema: `{"type":"string","format":"date"}`, isStrict: true,
			input: map[string]any{"go_live": "2026-05-26"}, wantOK: true,
		},
		{
			name: "DATE strict invalid", key: "go_live", schema: `{"type":"string","format":"date"}`, isStrict: true,
			input: map[string]any{"go_live": "not-a-date"}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},
		{
			name: "DATE strict edge (datetime not date)", key: "go_live", schema: `{"type":"string","format":"date"}`, isStrict: true,
			input: map[string]any{"go_live": "2026-05-26T10:00:00Z"}, wantOK: false, wantCode: "MetadataValidation.Failed",
		},

		// --- Empty / missing ---
		{
			name: "empty metadata accepted (no required keys)", key: "region", schema: `{"type":"string"}`, isStrict: true,
			input: map[string]any{}, wantOK: true,
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			composed := composeSchema(t, tt.key, tt.schema, tt.isStrict)
			err := ValidateMetadata(tt.input, composed)
			if tt.wantOK {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.True(t, kaitenerrors.IsUnprocessable(err),
				"expected an Unprocessable (422) error, got %v", err)
			if tt.wantCode != "" {
				var kerr *kaitenerrors.Error
				require.ErrorAs(t, err, &kerr)
				assert.Equal(t, tt.wantCode, kerr.Code)
			}
		})
	}
}

// --- ValidateMetadataForResource ---

type stubLister struct {
	fields []db.MetadataField
	err    error
	called db.ListMetadataFieldsByResourceTypeIncludingArchivedParams
}

func (s *stubLister) ListMetadataFieldsByResourceTypeIncludingArchived(
	_ context.Context,
	arg db.ListMetadataFieldsByResourceTypeIncludingArchivedParams,
) ([]db.MetadataField, error) {
	s.called = arg
	if s.err != nil {
		return nil, s.err
	}
	return s.fields, nil
}

func TestValidateMetadataForResource(t *testing.T) {
	t.Parallel()

	// Each subtest mints its own orgID so the process-wide schema cache (see
	// cache.go) doesn't carry state across parallel subtests. The single
	// `orgID := uuid.New()` at function scope that this file used to have
	// caused cross-subtest pollution once the cache shipped.
	t.Run("DZ strict accepts seed-style payload", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
			mkField("tier", `{"type":"string","enum":["a","b"]}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu", "tier": "a"}, nil,
		)
		assert.NoError(t, err)
		assert.Equal(t, orgID, stub.called.OrganizationID)
		assert.Equal(t, db.MetadataFieldResourceTypeDEPLOYMENTZONE, stub.called.ResourceType)
	})

	t.Run("DZ strict rejects unknown key", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu", "untracked": "x"}, nil,
		)
		require.Error(t, err)
		assert.True(t, kaitenerrors.IsUnprocessable(err))
	})

	t.Run("INSTANCE tolerant accepts unknown key", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkField("environment", `{"type":"string","enum":["production"]}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeINSTANCE,
			false,
			map[string]any{"environment": "production", "service_tier": "pro"}, nil,
		)
		assert.NoError(t, err)
	})

	t.Run("INSTANCE still rejects an invalid value for a known key", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkField("environment", `{"type":"string","enum":["production","staging"]}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeINSTANCE,
			false,
			map[string]any{"environment": "WRONG"}, nil,
		)
		require.Error(t, err)
		assert.True(t, kaitenerrors.IsUnprocessable(err))
	})

	t.Run("no fields declared: anything goes", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: nil}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"anything": "really", "and_more": 42}, nil,
		)
		assert.NoError(t, err)
	})

	t.Run("DB error propagates as plain error", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{err: errors.New("boom")}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{}, nil,
		)
		require.Error(t, err)
		assert.False(t, kaitenerrors.IsUnprocessable(err))
	})

	// --- S1: idempotent fast-path ---

	t.Run("idempotent fast-path: no-op update skips ajv entirely", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		// Stub that explodes if it's ever called — proves the validator
		// short-circuits without hitting the DB.
		stub := &stubLister{err: errors.New("ListMetadataFieldsByResourceTypeIncludingArchived must not be called on no-op update")}
		identical := map[string]any{"region": "eu", "tier": "gold"}
		out, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			identical,
			map[string]any{"region": "eu", "tier": "gold"},
		)
		require.NoError(t, err)
		assert.Equal(t, identical, out)
	})

	t.Run("idempotent fast-path does NOT fire when currentMetadata is nil", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		// nil currentMetadata = create — must go through validation.
		stub := &stubLister{fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{}, nil,
		)
		require.NoError(t, err)
		// The stub was called → not short-circuited.
		assert.Equal(t, orgID, stub.called.OrganizationID)
	})

	// --- archived-key semantics ---

	t.Run("archived key already present in current metadata is tolerated", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
			mkArchivedField("legacy_tier", `{"type":"string"}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu", "legacy_tier": "gold"},
			map[string]any{"legacy_tier": "gold"},
		)
		assert.NoError(t, err)
	})

	t.Run("archived key value can be freely changed while present", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		// Per the chosen semantics, a key whose field is archived behaves as
		// raw jsonb once it was already on the resource — no type re-check.
		stub := &stubLister{fields: []db.MetadataField{
			mkArchivedField("legacy_tier", `{"type":"string"}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"legacy_tier": 42}, // was a string, now a number — OK because archived
			map[string]any{"legacy_tier": "gold"},
		)
		assert.NoError(t, err)
	})

	t.Run("introducing an archived key is rejected with explicit code", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
			mkArchivedField("legacy_tier", `{"type":"string"}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu", "legacy_tier": "gold"},
			map[string]any{"region": "us"}, // legacy_tier NOT previously present
		)
		require.Error(t, err)
		assert.True(t, kaitenerrors.IsUnprocessable(err))
		var kerr *kaitenerrors.Error
		require.ErrorAs(t, err, &kerr)
		assert.Equal(t, "MetadataValidation.ArchivedKeyIntroduced", kerr.Code)
	})

	// --- a key declared again after its field was archived ---

	t.Run("key declared again after an archive can be introduced", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkArchivedField("tier", `{"type":"string"}`),
			mkField("tier", `{"type":"string","enum":["standard","pci-dss"]}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"tier": "standard"}, nil,
		)
		assert.NoError(t, err)
	})

	t.Run("key declared again after an archive is checked against the active field", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkArchivedField("tier", `{"type":"string"}`),
			mkField("tier", `{"type":"string","enum":["standard","pci-dss"]}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"tier": "gold"}, // valid for the archived field, not the active one
			map[string]any{"tier": "standard"},
		)
		require.Error(t, err)
		var kerr *kaitenerrors.Error
		require.ErrorAs(t, err, &kerr)
		assert.NotEqual(t, "MetadataValidation.ArchivedKeyIntroduced", kerr.Code)
		assert.True(t, kaitenerrors.IsUnprocessable(err))
	})

	t.Run("PUT omitting a key declared again does not re-inject it", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		// Active-key PUT semantics: an omitted active key is dropped. Only an
		// archived key is re-injected, and this one is active again.
		stub := &stubLister{fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
			mkArchivedField("tier", `{"type":"string"}`),
			mkField("tier", `{"type":"string"}`),
		}}
		resolved, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "us"},
			map[string]any{"region": "eu", "tier": "gold"},
		)
		require.NoError(t, err)
		assert.NotContains(t, resolved, "tier")
	})

	t.Run("all fields archived behaves as no-contract for non-archived keys", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkArchivedField("region", `{"type":"string"}`),
		}}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu", "anything": "goes"},
			map[string]any{"region": "us"},
		)
		assert.NoError(t, err)
	})

	t.Run("PUT omitting an archived key preserves it server-side", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		// updates are PUT (full-replace) — without server-side merge the
		// archived key would be dropped silently. says no: the
		// validator must reinject it so the write keeps the leftover.
		stub := &stubLister{fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
			mkArchivedField("legacy_tier", `{"type":"string"}`),
		}}
		resolved, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "us"}, // payload omits legacy_tier
			map[string]any{"region": "eu", "legacy_tier": "gold"},
		)
		require.NoError(t, err)
		assert.Equal(t, "us", resolved["region"])
		assert.Equal(t, "gold", resolved["legacy_tier"], "archived key should be preserved")
	})

	t.Run("server-side merge does not mutate caller's input map", func(t *testing.T) {
		t.Parallel()
		orgID := uuid.New()
		stub := &stubLister{fields: []db.MetadataField{
			mkArchivedField("legacy_tier", `{"type":"string"}`),
		}}
		input := map[string]any{"other": "kept"}
		_, err := ValidateMetadataForResource(
			context.Background(), stub, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			input,
			map[string]any{"legacy_tier": "gold"},
		)
		require.NoError(t, err)
		_, mutated := input["legacy_tier"]
		assert.False(t, mutated, "caller's input map must not be mutated by the merge")
	})
}
