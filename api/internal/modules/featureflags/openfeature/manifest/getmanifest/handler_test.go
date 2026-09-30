package getmanifest

// White-box unit tests for UseCase.Execute — exercising the fallback_value
// filter logic without a database. The unexported `repository` field is set
// directly by constructing a UseCase literal.

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// staticUserProvider is a test double that returns a fixed user.
type staticUserProvider struct {
	userID uuid.UUID
	orgID  uuid.UUID
}

func (s *staticUserProvider) GetUser(_ context.Context) (*currentuser.User, error) {
	return &currentuser.User{ID: s.userID, OrganizationID: s.orgID}, nil
}

// errUserProvider always fails GetUser.
type errUserProvider struct{}

func (e *errUserProvider) GetUser(_ context.Context) (*currentuser.User, error) {
	return nil, errors.New("auth error")
}

// stubRepository is a test double for Repository.
type stubRepository struct {
	flags []schema.FeatureFlag
	err   error
}

func (r *stubRepository) GetAllFeatureFlags(_ context.Context, _ uuid.UUID) ([]schema.FeatureFlag, error) {
	return r.flags, r.err
}

// newTestHandler wires a UseCase with test doubles (no real DB needed).
func newTestHandler(provider currentuser.Provider, flags []schema.FeatureFlag, repoErr error) *UseCase {
	return &UseCase{
		deps:       Deps{UserProvider: provider},
		repository: &stubRepository{flags: flags, err: repoErr},
	}
}

func orgID() uuid.UUID  { return uuid.MustParse("11111111-1111-1111-1111-111111111111") }
func userID() uuid.UUID { return uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") }

func provider() *staticUserProvider {
	return &staticUserProvider{userID: userID(), orgID: orgID()}
}

// ── helpers to build minimal flags ──────────────────────────────────────────

func boolFlag(slug string, metadata map[string]any) schema.FeatureFlag {
	return schema.FeatureFlag{
		Name:        slug,
		Slug:        slug,
		Type:        "boolean",
		Description: strPtrLocal("desc"),
		Metadata:    metadata,
	}
}

func strPtrLocal(s string) *string { return &s }

// ── tests ────────────────────────────────────────────────────────────────────

func TestHandler_Handle_EmptyRepository(t *testing.T) {
	h := newTestHandler(provider(), nil, nil)

	envelope, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.NotNil(t, envelope)
	require.Empty(t, envelope.Flags)
}

func TestHandler_Handle_AllFlagsLackFallbackValue(t *testing.T) {
	flags := []schema.FeatureFlag{
		boolFlag("flag-a", map[string]any{"team": "backend"}),
		boolFlag("flag-b", map[string]any{}),
		boolFlag("flag-c", nil),
	}
	h := newTestHandler(provider(), flags, nil)

	envelope, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.Empty(t, envelope.Flags)
}

func TestHandler_Handle_OnlyFlagsWithFallbackValueAreReturned(t *testing.T) {
	flags := []schema.FeatureFlag{
		boolFlag("with-fallback", map[string]any{"fallback_value": false}),
		boolFlag("no-fallback", map[string]any{"team": "platform"}),
	}
	h := newTestHandler(provider(), flags, nil)

	envelope, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.Len(t, envelope.Flags, 1)
	require.Equal(t, "with-fallback", envelope.Flags[0].Key)
}

func TestHandler_Handle_ManifestFlag_FieldsAreMappedCorrectly(t *testing.T) {
	desc := "controls AI feature"
	flag := schema.FeatureFlag{
		Slug:        "ai-assist",
		Name:        "AI Assistant",
		Type:        "boolean",
		Description: &desc,
		Metadata:    map[string]any{"fallback_value": true},
	}
	h := newTestHandler(provider(), []schema.FeatureFlag{flag}, nil)

	envelope, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.Len(t, envelope.Flags, 1)
	mf := envelope.Flags[0]
	require.Equal(t, "ai-assist", mf.Key)
	require.Equal(t, "AI Assistant", mf.Name)
	require.Equal(t, "boolean", mf.Type)
	require.NotNil(t, mf.Description)
	require.Equal(t, desc, *mf.Description)
	require.Equal(t, true, mf.DefaultValue)
}

func TestHandler_Handle_FallbackValueTypes(t *testing.T) {
	tests := []struct {
		name          string
		fallbackValue any
	}{
		{"bool false", false},
		{"bool true", true},
		{"string", "light"},
		{"number int", float64(100)},
		{"object", map[string]any{"max": float64(3)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := boolFlag("flag-"+tt.name, map[string]any{"fallback_value": tt.fallbackValue})
			h := newTestHandler(provider(), []schema.FeatureFlag{flag}, nil)

			envelope, err := h.Execute(context.Background())

			require.NoError(t, err)
			require.Len(t, envelope.Flags, 1)
			require.Equal(t, tt.fallbackValue, envelope.Flags[0].DefaultValue)
		})
	}
}

func TestHandler_Handle_RepositoryError_PropagatesError(t *testing.T) {
	repoErr := errors.New("database unavailable")
	h := newTestHandler(provider(), nil, repoErr)

	_, err := h.Execute(context.Background())

	require.ErrorIs(t, err, repoErr)
}

func TestHandler_Handle_UserProviderError_PropagatesError(t *testing.T) {
	h := newTestHandler(&errUserProvider{}, nil, nil)

	_, err := h.Execute(context.Background())

	require.Error(t, err)
}

func TestManifestType(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"boolean", "boolean"},
		{"string", "string"},
		{"object", "object"},
		{"number", "integer"}, // OpenFeature manifest spec uses "integer"
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			require.Equal(t, tt.want, manifestType(tt.input))
		})
	}
}

func TestHandler_Handle_NumberFlag_TypeIsInteger(t *testing.T) {
	flag := schema.FeatureFlag{
		Slug:     "rate-limit",
		Name:     "Rate Limit",
		Type:     "number",
		Metadata: map[string]any{"fallback_value": float64(100)},
	}
	h := newTestHandler(provider(), []schema.FeatureFlag{flag}, nil)

	envelope, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.Len(t, envelope.Flags, 1)
	require.Equal(t, "integer", envelope.Flags[0].Type)
}

func TestHandler_Handle_NumberFlag_TypeIsFloat(t *testing.T) {
	flag := schema.FeatureFlag{
		Slug:     "cpu-budget",
		Name:     "CPU Budget",
		Type:     "number",
		Metadata: map[string]any{"fallback_value": float64(12.5)},
	}
	h := newTestHandler(provider(), []schema.FeatureFlag{flag}, nil)

	envelope, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.Len(t, envelope.Flags, 1)
	require.Equal(t, "float", envelope.Flags[0].Type)
}

func TestInferManifestType_NumberFallbackValue(t *testing.T) {
	tests := []struct {
		name     string
		fallback any
		want     string
	}{
		{name: "int", fallback: 12, want: "integer"},
		{name: "float64 whole", fallback: float64(12), want: "integer"},
		{name: "float64 decimal", fallback: float64(12.75), want: "float"},
		{name: "json number integer", fallback: json.Number("42"), want: "integer"},
		{name: "json number decimal", fallback: json.Number("42.1"), want: "float"},
		{name: "unknown fallback", fallback: "not-a-number", want: "integer"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, inferManifestType("number", tt.fallback))
		})
	}
}

func TestHandler_Handle_MultipleFlags_AllWithFallbackValue(t *testing.T) {
	flags := []schema.FeatureFlag{
		{Slug: "f1", Name: "Flag 1", Type: "boolean", Metadata: map[string]any{"fallback_value": false}},
		{Slug: "f2", Name: "Flag 2", Type: "string", Metadata: map[string]any{"fallback_value": "light"}},
		{Slug: "f3", Name: "Flag 3", Type: "number", Metadata: map[string]any{"fallback_value": float64(42)}}, // stored as "number", served as "integer"
	}
	h := newTestHandler(provider(), flags, nil)

	envelope, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.Len(t, envelope.Flags, 3)

	keys := make(map[string]bool, 3)
	for _, mf := range envelope.Flags {
		keys[mf.Key] = true
	}
	require.True(t, keys["f1"])
	require.True(t, keys["f2"])
	require.True(t, keys["f3"])
}
