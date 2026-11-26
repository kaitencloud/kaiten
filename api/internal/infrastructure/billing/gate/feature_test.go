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

// A licensing authority that cannot answer is not asked again on every read for
// featureRetryAfter: each read would otherwise wait for its timeout. Once that
// has passed, it is asked again, and a known answer clears the wait.
func TestFeatureDoesNotRetryAFailedLookupAtOnce(t *testing.T) {
	entitlements := &countingEntitlements{err: errors.New("licensing authority unreachable")}
	feature := NewFeatureKeptWhenUnknown(entitlements, dogfooding.ThresholdAlertingEntitlementSlug, time.Minute)
	org := uuid.New()

	require.True(t, feature.Granted(t.Context(), org))
	require.True(t, feature.Granted(t.Context(), org))
	require.Equal(t, 1, entitlements.calls, "a second read during the wait asks nothing")

	entitlements.err = nil
	entitlements.entitled = false
	feature.failures.now = func() time.Time { return time.Now().Add(featureRetryAfter + time.Second) }
	require.False(t, feature.Granted(t.Context(), org), "after the wait, the authority is asked and followed")
	require.Equal(t, 2, entitlements.calls)
}
