package aiusage

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type scriptedFlags struct {
	mu    sync.Mutex
	value bool
	err   error
	calls map[uuid.UUID]int
}

func (f *scriptedFlags) BooleanValue(_ context.Context, org uuid.UUID, _ string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.calls == nil {
		f.calls = map[uuid.UUID]int{}
	}
	f.calls[org]++
	return f.value, f.err
}

func (f *scriptedFlags) set(value bool, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.value, f.err = value, err
}

func (f *scriptedFlags) asked(org uuid.UUID) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[org]
}

// cachedAt returns a 30 s cache over source whose clock the test moves.
func cachedAt(t *testing.T, source FlagReader) (*CachedFlags, *time.Time) {
	t.Helper()
	cache, ok := NewCachedFlags(source, 30*time.Second).(*CachedFlags)
	require.True(t, ok)
	now := time.Date(2026, 11, 11, 9, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }
	cache.prunedAt = now
	return cache, &now
}

func TestCachedFlagsKeepBothAnswersForOneTTLPerOrganization(t *testing.T) {
	t.Parallel()
	for _, value := range []bool{true, false} {
		source := &scriptedFlags{value: value}
		cache, now := cachedAt(t, source)
		org, other := uuid.New(), uuid.New()
		for range 3 {
			got, err := cache.BooleanValue(t.Context(), org, FlagKey)
			require.NoError(t, err)
			require.Equal(t, value, got)
		}
		require.Equal(t, 1, source.asked(org), "one source call per TTL, whichever the answer")
		_, err := cache.BooleanValue(t.Context(), other, FlagKey)
		require.NoError(t, err)
		require.Equal(t, 1, source.asked(other), "an answer is never shared between organizations")

		source.set(!value, nil)
		*now = now.Add(29 * time.Second)
		got, err := cache.BooleanValue(t.Context(), org, FlagKey)
		require.NoError(t, err)
		require.Equal(t, value, got, "a change is not seen inside the TTL")
		*now = now.Add(time.Second)
		got, err = cache.BooleanValue(t.Context(), org, FlagKey)
		require.NoError(t, err)
		require.Equal(t, !value, got, "and is seen once it has passed")
		require.Equal(t, 2, source.asked(org))
	}
}

func TestCachedFlagsServeTheLastAnswerDuringAnOutageThenFailClosed(t *testing.T) {
	t.Parallel()
	down := errors.New("flag source down")
	for _, value := range []bool{true, false} {
		source := &scriptedFlags{value: value}
		cache, now := cachedAt(t, source)
		org := uuid.New()
		_, err := cache.BooleanValue(t.Context(), org, FlagKey)
		require.NoError(t, err)

		source.set(false, down)
		*now = now.Add(30 * time.Second)
		for range 3 {
			got, err := cache.BooleanValue(t.Context(), org, FlagKey)
			require.NoError(t, err, "a failed refresh serves the last known answer")
			require.Equal(t, value, got)
		}
		require.Equal(t, 2, source.asked(org), "a failure is kept for one TTL too: no call per request during an outage")

		*now = now.Add(269 * time.Second) // 299 s after the last successful answer
		got, err := cache.BooleanValue(t.Context(), org, FlagKey)
		require.NoError(t, err)
		require.Equal(t, value, got, "still inside the stale bound of ten TTLs")

		*now = now.Add(time.Second)
		got, err = cache.BooleanValue(t.Context(), org, FlagKey)
		require.ErrorIs(t, err, down, "past the bound the source's failure is the answer")
		require.False(t, got)
		policy := Policy{Flags: cache}
		require.False(t, policy.Enabled(policy.Resolve(t.Context(), org)), "which the policy reads as closed")

		source.set(true, nil)
		*now = now.Add(30 * time.Second)
		got, err = cache.BooleanValue(t.Context(), org, FlagKey)
		require.NoError(t, err)
		require.True(t, got, "recovery is seen within one TTL")
	}
}

func TestCachedFlagsNeverOpenAnOrganizationTheSourceNeverAnswered(t *testing.T) {
	t.Parallel()
	down := errors.New("flag source down")
	source := &scriptedFlags{value: true, err: down}
	cache, now := cachedAt(t, source)
	org := uuid.New()
	for range 2 {
		got, err := cache.BooleanValue(t.Context(), org, FlagKey)
		require.ErrorIs(t, err, down)
		require.False(t, got)
	}
	require.Equal(t, 1, source.asked(org))
	*now = now.Add(30 * time.Second)
	_, err := cache.BooleanValue(t.Context(), org, FlagKey)
	require.ErrorIs(t, err, down)
	require.Equal(t, 2, source.asked(org))
}

type blockingFlags struct {
	calls   atomic.Int64
	started chan struct{}
	release chan struct{}
}

func (f *blockingFlags) BooleanValue(context.Context, uuid.UUID, string) (bool, error) {
	if f.calls.Add(1) == 1 {
		close(f.started)
	}
	<-f.release
	return true, nil
}

func TestCachedFlagsShareOneSourceCallAmongConcurrentOperations(t *testing.T) {
	t.Parallel()
	source := &blockingFlags{started: make(chan struct{}), release: make(chan struct{})}
	cache := NewCachedFlags(source, 30*time.Second)
	org := uuid.New()
	const operations = 64
	var wg sync.WaitGroup
	answers := make(chan bool, operations)
	for range operations {
		wg.Go(func() {
			got, err := cache.BooleanValue(t.Context(), org, FlagKey)
			answers <- err == nil && got
		})
	}
	<-source.started

	// A caller that gives up leaves the shared call running for the others.
	impatient, cancel := context.WithCancel(t.Context())
	cancel()
	_, err := cache.BooleanValue(impatient, org, FlagKey)
	require.ErrorIs(t, err, context.Canceled)

	close(source.release)
	wg.Wait()
	close(answers)
	for answer := range answers {
		require.True(t, answer)
	}
	require.EqualValues(t, 1, source.calls.Load(), "a cold organization must not stampede the source")
	got, err := cache.BooleanValue(t.Context(), org, FlagKey)
	require.NoError(t, err)
	require.True(t, got)
	require.EqualValues(t, 1, source.calls.Load())
}

func TestCachedFlagsAreOptional(t *testing.T) {
	t.Parallel()
	require.Nil(t, NewCachedFlags(nil, time.Minute), "no source stays closed, not a typed nil reader")
	source := &scriptedFlags{value: true}
	require.Same(t, source, NewCachedFlags(source, 0), "a zero TTL evaluates on every operation")
}

type panickingFlags struct{ calls atomic.Int64 }

func (f *panickingFlags) BooleanValue(context.Context, uuid.UUID, string) (bool, error) {
	f.calls.Add(1)
	panic("evaluator bug")
}

func TestCachedFlagsTurnASourcePanicIntoAFailedAnswer(t *testing.T) {
	t.Parallel()
	source := &panickingFlags{}
	cache := NewCachedFlags(source, 30*time.Second)
	org := uuid.New()
	for range 2 {
		got, err := cache.BooleanValue(t.Context(), org, FlagKey)
		require.ErrorContains(t, err, "evaluator bug")
		require.False(t, got)
	}
	require.EqualValues(t, 1, source.calls.Load(), "kept for one TTL like any other failure")
}

func TestCachedFlagsForgetOrganizationsNobodyAsksAbout(t *testing.T) {
	t.Parallel()
	source := &scriptedFlags{value: true}
	cache, now := cachedAt(t, source)
	deleted, active := uuid.New(), uuid.New()
	for _, org := range []uuid.UUID{deleted, active} {
		_, err := cache.BooleanValue(t.Context(), org, FlagKey)
		require.NoError(t, err)
	}
	entries := func() int {
		cache.mu.Lock()
		defer cache.mu.Unlock()
		return len(cache.entries)
	}
	require.Equal(t, 2, entries())
	*now = now.Add(299 * time.Second)
	_, err := cache.BooleanValue(t.Context(), active, FlagKey)
	require.NoError(t, err)
	require.Equal(t, 2, entries(), "kept while inside the stale bound")
	*now = now.Add(30 * time.Second)
	_, err = cache.BooleanValue(t.Context(), active, FlagKey)
	require.NoError(t, err)
	require.Equal(t, 1, entries(), "an entry not asked about for ten TTLs is dropped")
	got, err := cache.BooleanValue(t.Context(), deleted, FlagKey)
	require.NoError(t, err)
	require.True(t, got, "and simply asked again if it comes back")
}
