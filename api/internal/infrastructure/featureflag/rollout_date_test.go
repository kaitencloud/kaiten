package featureflag_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
)

func TestResolveRolloutDate_BeforeStartReturnsStartVariant(t *testing.T) {
	start := time.Now().Add(24 * time.Hour)
	end := start.Add(24 * time.Hour)

	got := featureflag.ResolveRolloutDate("flag-1", "user-1", 0, 100, start, end, "start", "end")

	require.Equal(t, "start", got)
}

func TestResolveRolloutDate_AfterEndReturnsEndVariant(t *testing.T) {
	end := time.Now().Add(-24 * time.Hour)
	start := end.Add(-24 * time.Hour)

	got := featureflag.ResolveRolloutDate("flag-1", "user-1", 0, 100, start, end, "start", "end")

	require.Equal(t, "end", got)
}

func TestResolveRolloutDate_ZeroToZeroPercentAlwaysStartVariant(t *testing.T) {
	start := time.Now().Add(-1 * time.Hour)
	end := time.Now().Add(1 * time.Hour)

	for _, key := range []string{"a", "b", "c", "d", "e"} {
		got := featureflag.ResolveRolloutDate("flag-1", key, 0, 0, start, end, "start", "end")
		require.Equal(t, "start", got)
	}
}

func TestResolveRolloutDate_HundredToHundredPercentAlwaysEndVariant(t *testing.T) {
	start := time.Now().Add(-1 * time.Hour)
	end := time.Now().Add(1 * time.Hour)

	for _, key := range []string{"a", "b", "c", "d", "e"} {
		got := featureflag.ResolveRolloutDate("flag-1", key, 100, 100, start, end, "start", "end")
		require.Equal(t, "end", got)
	}
}

func TestResolveRolloutDate_Deterministic(t *testing.T) {
	start := time.Now().Add(-1 * time.Hour)
	end := time.Now().Add(1 * time.Hour)

	got := featureflag.ResolveRolloutDate("flag-1", "user-1", 20, 80, start, end, "start", "end")
	for range 10 {
		require.Equal(t, got, featureflag.ResolveRolloutDate("flag-1", "user-1", 20, 80, start, end, "start", "end"))
	}
}

// TestResolveRolloutDate_ProgressiveRolloutClimbsTowardEndVariant is the
// regression test for a real inversion bug: a scheduled release configured
// the natural way (0% -> 100%, old variant -> new variant) must climb toward
// the new variant as time passes, not away from it. Percentages here are
// approximate (bucket hashing, not a precise count), so the tolerance is
// generous — the point is the direction and the rough shape of the ramp, not
// an exact value at any one instant.
func TestResolveRolloutDate_ProgressiveRolloutClimbsTowardEndVariant(t *testing.T) {
	const windowMinutes = 200
	const sampleSize = 3000

	percentOnEndVariant := func(elapsedFraction float64) float64 {
		start := time.Now().Add(-time.Duration(float64(windowMinutes)*elapsedFraction) * time.Minute)
		end := start.Add(windowMinutes * time.Minute)

		onEnd := 0
		for i := range sampleSize {
			key := fmt.Sprintf("user-%d", i)
			if featureflag.ResolveRolloutDate("flag-1", key, 0, 100, start, end, "old", "new") == "new" {
				onEnd++
			}
		}
		return float64(onEnd) / float64(sampleSize) * 100
	}

	at10 := percentOnEndVariant(0.10)
	at50 := percentOnEndVariant(0.50)
	at90 := percentOnEndVariant(0.90)

	require.InDelta(t, 10, at10, 8, "10%% into the window, roughly 10%% should have the new variant")
	require.InDelta(t, 50, at50, 8, "halfway through the window, roughly half should have the new variant")
	require.InDelta(t, 90, at90, 8, "90%% into the window, roughly 90%% should have the new variant")

	require.Less(t, at10, at50, "the share on the new variant must climb, not fall, as the window progresses")
	require.Less(t, at50, at90, "the share on the new variant must climb, not fall, as the window progresses")
}
