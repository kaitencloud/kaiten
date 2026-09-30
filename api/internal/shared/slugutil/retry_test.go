package slugutil_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
)

// fakeConflictError wraps slugutil.ErrConflict the same way a create-flow
// repository would (via apierrors.Wrap), to prove Retry only needs
// errors.Is to see through the wrapping -- it doesn't need to know about
// apierrors.Error at all.
type fakeConflictError struct {
	err error
}

func (e *fakeConflictError) Error() string { return fmt.Sprintf("conflict: %v", e.err) }
func (e *fakeConflictError) Unwrap() error { return e.err }

func newFakeConflict() error {
	return &fakeConflictError{err: slugutil.ErrConflict}
}

func TestRetry_SucceedsFirstAttemptWithoutRetrying(t *testing.T) {
	generateCalls := 0
	attemptCalls := 0

	result, err := slugutil.Retry(
		slugutil.DefaultMaxAttempts,
		func() (string, error) {
			generateCalls++
			return "acme-abc123", nil
		},
		func(slug string) (string, error) {
			attemptCalls++
			return "created:" + slug, nil
		},
	)

	require.NoError(t, err)
	require.Equal(t, "created:acme-abc123", result)
	require.Equal(t, 1, generateCalls)
	require.Equal(t, 1, attemptCalls)
}

// TestRetry_RegeneratesAndRetriesOnConflict is the core regression test for
// this fix: it fakes a first-attempt Postgres unique-violation (surfaced as
// a wrapped slugutil.ErrConflict, exactly like a create-flow repository
// would return it) and asserts Retry regenerates a fresh slug and succeeds
// on the second attempt, rather than surfacing the conflict to the caller.
func TestRetry_RegeneratesAndRetriesOnConflict(t *testing.T) {
	slugsGenerated := []string{"acme-attempt-1", "acme-attempt-2"}
	generateCalls := 0
	var attemptedSlugs []string

	result, err := slugutil.Retry(
		slugutil.DefaultMaxAttempts,
		func() (string, error) {
			slug := slugsGenerated[generateCalls]
			generateCalls++
			return slug, nil
		},
		func(slug string) (string, error) {
			attemptedSlugs = append(attemptedSlugs, slug)
			if slug == "acme-attempt-1" {
				return "", newFakeConflict()
			}
			return "created:" + slug, nil
		},
	)

	require.NoError(t, err)
	require.Equal(t, "created:acme-attempt-2", result)
	require.Equal(t, 2, generateCalls)
	require.Equal(t, []string{"acme-attempt-1", "acme-attempt-2"}, attemptedSlugs)
}

func TestRetry_DoesNotRetryNonConflictErrors(t *testing.T) {
	generateCalls := 0
	attemptCalls := 0
	boom := errors.New("boom: not a slug conflict")

	_, err := slugutil.Retry(
		slugutil.DefaultMaxAttempts,
		func() (string, error) {
			generateCalls++
			return "acme-abc123", nil
		},
		func(_ string) (int, error) {
			attemptCalls++
			return 0, boom
		},
	)

	require.ErrorIs(t, err, boom)
	require.Equal(t, 1, generateCalls)
	require.Equal(t, 1, attemptCalls)
}

func TestRetry_GivesUpAfterMaxAttemptsAndReturnsLastError(t *testing.T) {
	const maxAttempts = 3
	attemptCalls := 0

	_, err := slugutil.Retry(
		maxAttempts,
		func() (string, error) {
			return "acme-always-taken", nil
		},
		func(_ string) (string, error) {
			attemptCalls++
			return "", newFakeConflict()
		},
	)

	require.Error(t, err)
	require.True(t, errors.Is(err, slugutil.ErrConflict))
	require.Equal(t, maxAttempts, attemptCalls)
}

func TestRetry_StopsGeneratingOnGenerateError(t *testing.T) {
	generateErr := errors.New("crypto/rand unavailable")
	attemptCalls := 0

	_, err := slugutil.Retry(
		slugutil.DefaultMaxAttempts,
		func() (string, error) {
			return "", generateErr
		},
		func(_ string) (string, error) {
			attemptCalls++
			return "unreachable", nil
		},
	)

	require.ErrorIs(t, err, generateErr)
	require.Equal(t, 0, attemptCalls)
}

func TestRetry_TreatsBelowOneMaxAttemptsAsOne(t *testing.T) {
	attemptCalls := 0

	_, err := slugutil.Retry(
		0,
		func() (string, error) { return "acme-abc123", nil },
		func(_ string) (string, error) {
			attemptCalls++
			return "", newFakeConflict()
		},
	)

	require.Error(t, err)
	require.Equal(t, 1, attemptCalls)
}
