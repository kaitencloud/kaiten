package platformflags

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	instancetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/instances/targetingfacts"
)

type repositoryFunc func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error)

func (f repositoryFunc) GetFeatureFlag(ctx context.Context, key string, source uuid.UUID) (*schema.FeatureFlag, error) {
	return f(ctx, key, source)
}

func rolloutFlag(target uuid.UUID) *schema.FeatureFlag {
	return &schema.FeatureFlag{
		ID:             uuid.Nil,
		Type:           "boolean",
		Variants:       []schema.Variant{{Name: "off", Description: "", Value: false}, {Name: "on", Description: "", Value: true}},
		Targetings:     schema.Targetings{schema.NewBasicTargeting("Local organization", "organizationId == '"+target.String()+"'", "on")},
		Name:           "AI credits",
		Description:    nil,
		DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
		Slug:           "ai-credits",
		Metadata:       map[string]any{"fallback_value": false},
		Enabled:        true,
		EventName:      "",
	}
}

func TestReaderUsesTrustedSourceAndAuthenticatedTarget(t *testing.T) {
	source, eligible, other := uuid.New(), uuid.New(), uuid.New()
	calls := 0
	r := &Reader{source: source, repository: repositoryFunc(func(ctx context.Context, key string, owner uuid.UUID) (*schema.FeatureFlag, error) {
		calls++
		require.Equal(t, source, owner)
		require.Equal(t, "ai-credits", key)
		_, bounded := ctx.Deadline()
		require.True(t, bounded)
		return rolloutFlag(eligible), nil
	})}
	for _, target := range []uuid.UUID{eligible, other, source} {
		value, err := r.BooleanValue(t.Context(), target, "ai-credits")
		require.NoError(t, err)
		require.Equal(t, target == eligible, value)
	}
	require.Equal(t, 3, calls, "each operation reads the flag, including the platform's own organization")
}

func TestReaderFailsClosed(t *testing.T) {
	source, target := uuid.New(), uuid.New()
	failure := errors.New("source unavailable")
	cases := []struct {
		name   string
		mutate func(*schema.FeatureFlag)
		flag   bool
		err    error
	}{
		{name: "missing", mutate: nil, flag: false, err: nil},
		{name: "query error", mutate: nil, flag: true, err: failure},
		{name: "disabled even with true default", mutate: func(f *schema.FeatureFlag) { f.Enabled = false; f.DefaultVariant.Value = schema.BasicVariant("on") }, flag: true, err: nil},
		{name: "wrong flag type", mutate: func(f *schema.FeatureFlag) { f.Type = "string" }, flag: true, err: nil},
		{name: "wrong value type", mutate: func(f *schema.FeatureFlag) { f.Variants[1].Value = "true" }, flag: true, err: nil},
		{name: "wrong key", mutate: func(f *schema.FeatureFlag) { f.Slug = "customer-flag" }, flag: true, err: nil},
		{name: "missing default", mutate: func(f *schema.FeatureFlag) { f.DefaultVariant = nil }, flag: true, err: nil},
		{name: "missing default value", mutate: func(f *schema.FeatureFlag) { f.DefaultVariant.Value = nil }, flag: true, err: nil},
		{name: "broken targeting cannot allow default true", mutate: func(f *schema.FeatureFlag) {
			f.Targetings = schema.Targetings{schema.NewBasicTargeting("Unknown facts", "missing == true", "on")}
			f.DefaultVariant.Value = schema.BasicVariant("on")
		}, flag: true, err: nil},
		{name: "nil targeting", mutate: func(f *schema.FeatureFlag) { f.Targetings = schema.Targetings{nil} }, flag: true, err: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := &Reader{source: source, repository: repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) {
				if !tc.flag {
					return nil, tc.err
				}
				f := rolloutFlag(target)
				if tc.mutate != nil {
					tc.mutate(f)
				}
				return f, tc.err
			})}
			value, err := r.BooleanValue(t.Context(), target, "ai-credits")
			require.False(t, value)
			require.Error(t, err)
		})
	}
}

func TestReaderDoesNotRetainPositiveResult(t *testing.T) {
	target := uuid.New()
	flag := rolloutFlag(target)
	r := &Reader{source: uuid.New(), repository: repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) { return flag, nil })}
	value, err := r.BooleanValue(t.Context(), target, "ai-credits")
	require.NoError(t, err)
	require.True(t, value)
	flag.Enabled = false
	value, err = r.BooleanValue(t.Context(), target, "ai-credits")
	require.Error(t, err)
	require.False(t, value)
}

func TestReaderMissingAuthorityAndTargetNeverQuery(t *testing.T) {
	repository := repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) {
		t.Fatal("untrusted source or target must not query")
		return nil, nil
	})
	for _, r := range []*Reader{nil, {}, New(nil, uuid.New()), {source: uuid.Nil, repository: repository}} {
		value, err := r.BooleanValue(t.Context(), uuid.New(), "ai-credits")
		require.False(t, value)
		require.Error(t, err)
	}
	r := &Reader{source: uuid.New(), repository: repository}
	value, err := r.BooleanValue(t.Context(), uuid.Nil, "ai-credits")
	require.False(t, value)
	require.Error(t, err)
	value, err = r.BooleanValue(t.Context(), uuid.New(), "")
	require.False(t, value)
	require.Error(t, err)
}

func TestReaderCancelledEvaluationNeverAllows(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	r := &Reader{source: uuid.New(), repository: repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) {
		t.Fatal("cancelled operation must not query")
		return nil, nil
	})}
	value, err := r.BooleanValue(ctx, uuid.New(), "ai-credits")
	require.False(t, value)
	require.ErrorIs(t, err, context.Canceled)
}

// instancesFunc is the owning module's read port, faked: a rollout evaluation
// only ever resolves one instance by slug.
type instancesFunc func(context.Context, uuid.UUID, string) (*instancetargetingfacts.Instance, error)

func (f instancesFunc) GetOneBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*instancetargetingfacts.Instance, error) {
	return f(ctx, organizationID, slug)
}

func (f instancesFunc) GetByIDs(context.Context, uuid.UUID, []uuid.UUID) ([]instancetargetingfacts.Instance, error) {
	return nil, errors.New("a rollout evaluation resolves one instance, by slug")
}

func ruleFlag(rule string) *schema.FeatureFlag {
	flag := rolloutFlag(uuid.Nil)
	flag.Targetings = schema.Targetings{schema.NewBasicTargeting("Preview", rule, "on")}
	return flag
}

const metadataRule = "has(__kaiten.instance.metadata.aiCredits) && __kaiten.instance.metadata.aiCredits == true"

func TestReaderReadsTheTrackedInstanceOfTheEvaluatedOrganization(t *testing.T) {
	source, target := uuid.New(), uuid.New()
	var askedOrganization uuid.UUID
	var askedSlug string
	r := &Reader{
		source: source,
		repository: repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) {
			return ruleFlag(metadataRule), nil
		}),
		instances: instancesFunc(func(_ context.Context, organizationID uuid.UUID, slug string) (*instancetargetingfacts.Instance, error) {
			askedOrganization, askedSlug = organizationID, slug
			return &instancetargetingfacts.Instance{Metadata: []byte(`{"aiCredits":true,"demo":true}`)}, nil
		}),
	}

	value, err := r.BooleanValue(t.Context(), target, "ai-credits")

	require.NoError(t, err)
	require.True(t, value, "a rule on the tracked instance's metadata decides the rollout")
	require.Equal(t, source, askedOrganization, "the tracked instance lives in the platform catalogue, not the evaluated organization")
	require.Equal(t, target.String(), askedSlug, "and is slugged with the evaluated organization's id")
}

func TestReaderIsOffWhenTheMetadataKeyIsAbsent(t *testing.T) {
	r := &Reader{
		source: uuid.New(),
		repository: repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) {
			return ruleFlag(metadataRule), nil
		}),
		instances: instancesFunc(func(context.Context, uuid.UUID, string) (*instancetargetingfacts.Instance, error) {
			return &instancetargetingfacts.Instance{Metadata: []byte(`{"demo":true}`)}, nil
		}),
	}

	value, err := r.BooleanValue(t.Context(), uuid.New(), "ai-credits")

	require.NoError(t, err, "the guarded rule does not break on an instance that was never let in")
	require.False(t, value)
}

func TestReaderRefusesARuleReadingGatedFacts(t *testing.T) {
	r := &Reader{
		source: uuid.New(),
		repository: repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) {
			return ruleFlag("__kaiten.entitlements['ai-credits'].unlimited == true"), nil
		}),
		instances: instancesFunc(func(context.Context, uuid.UUID, string) (*instancetargetingfacts.Instance, error) {
			return &instancetargetingfacts.Instance{Metadata: []byte(`{"aiCredits":true}`)}, nil
		}),
	}

	value, err := r.BooleanValue(t.Context(), uuid.New(), "ai-credits")

	require.Error(t, err, "entitlement facts are gated by this very flag, so a rule reading them is refused, not half-answered")
	require.False(t, value)
}

func TestReaderEvaluatesWithoutFactPorts(t *testing.T) {
	target := uuid.New()
	r := &Reader{
		source: uuid.New(),
		repository: repositoryFunc(func(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error) {
			return rolloutFlag(target), nil
		}),
	}

	value, err := r.BooleanValue(t.Context(), target, "ai-credits")

	require.NoError(t, err, "a rule on the organization id needs no lookup at all")
	require.True(t, value)
}
