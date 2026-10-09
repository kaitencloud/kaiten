package ratelimit

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestKeyedHasOneBucketPerKey(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	l := New[string](Every(10, 10*time.Minute), 10)

	for i := range 10 {
		_, ok := l.Allow("a", now)
		require.True(t, ok, "attempt %d is within the burst", i)
	}
	wait, ok := l.Allow("a", now)
	require.False(t, ok)
	require.Equal(t, time.Minute, wait, "one token a minute")

	_, ok = l.Allow("b", now)
	require.True(t, ok, "another key has its own bucket")

	_, ok = l.Allow("a", now.Add(time.Minute))
	require.True(t, ok, "a minute later, one more")
}

func TestKeyedKeepsABucketUntilItRefilled(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	// 30 an hour refills in an hour: longer than the idle sweep's 10 minutes.
	l := New[string](Every(30, time.Hour), 30)
	for range 30 {
		l.Allow("a", now)
	}
	_, ok := l.Allow("a", now.Add(20*time.Minute).Add(-time.Second))
	require.True(t, ok, "20 minutes refill 10 tokens")
	for range 9 {
		l.Allow("a", now.Add(20*time.Minute))
	}
	// A sweep at 40 minutes must not drop the empty bucket and hand out 30 more.
	_, ok = l.Allow("b", now.Add(40*time.Minute))
	require.True(t, ok)
	n := 0
	for {
		if _, ok := l.Allow("a", now.Add(40*time.Minute)); !ok {
			break
		}
		n++
	}
	require.Equal(t, 10, n, "20 more minutes refilled 10, not the whole burst")
}

func TestAllTakesFromEveryBucketOrNone(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	session := New[string](Every(10, 10*time.Minute), 10)
	customer := New[string](Every(30, time.Hour), 30)

	// One session spends its ten.
	for range 10 {
		_, ok := All(session.Reserve("s1", now), customer.Reserve("c", now))
		require.True(t, ok)
	}
	// Refused by the session: the customer's token is given back.
	wait, ok := All(session.Reserve("s1", now), customer.Reserve("c", now))
	require.False(t, ok)
	require.Equal(t, time.Minute, wait)

	// Two more sessions of the same customer: 20 more, then the customer's
	// hour is spent, though neither session is.
	for range 10 {
		_, ok := All(session.Reserve("s2", now), customer.Reserve("c", now))
		require.True(t, ok)
	}
	for range 10 {
		_, ok := All(session.Reserve("s3", now), customer.Reserve("c", now))
		require.True(t, ok)
	}
	wait, ok = All(session.Reserve("s4", now), customer.Reserve("c", now))
	require.False(t, ok)
	require.Equal(t, 2*time.Minute, wait, "the customer's bucket refills one every two minutes")
	_, ok = session.Allow("s4", now)
	require.True(t, ok, "the refused attempt took nothing from the new session")
}
