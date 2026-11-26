package gate

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// An organization the licensing authority never answered for: a feature better
// hidden than shown reads false, one better kept than silenced reads true.
func TestFeatureUnknownAnswer(t *testing.T) {
	down := &fakeEntitlements{err: errors.New("licensing authority unreachable")}
	org := uuid.New()

	require.False(t, NewFeature(down, dogfooding.RemovePoweredByEntitlementSlug, time.Minute).Granted(t.Context(), org))
	require.True(t, NewFeatureKeptWhenUnknown(down, dogfooding.ThresholdAlertingEntitlementSlug, time.Minute).Granted(t.Context(), org))
	require.Equal(t, dogfooding.ThresholdAlertingEntitlementSlug, down.asked)
}

// A known answer is followed, fresh and while it stands in for an unreachable
// licensing authority: kept-when-unknown changes nothing once the plan was read.
func TestFeatureKeptWhenUnknownFollowsAKnownAnswer(t *testing.T) {
	entitlements := &fakeEntitlements{entitled: false}
	feature := NewFeatureKeptWhenUnknown(entitlements, dogfooding.ThresholdAlertingEntitlementSlug, time.Minute)
	org := uuid.New()

	require.False(t, feature.Granted(t.Context(), org))

	entitlements.err = errors.New("licensing authority unreachable")
	feature.answers.now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	require.False(t, feature.Granted(t.Context(), org), "a stale known answer stands in for an outage")
}

// Self-hosted, nil entitlements are AlwaysEntitled: every feature is granted.
func TestFeatureKeptWhenUnknownSelfHosted(t *testing.T) {
	require.True(t, NewFeatureKeptWhenUnknown(nil, dogfooding.ThresholdAlertingEntitlementSlug, 0).Granted(t.Context(), uuid.New()))
}
