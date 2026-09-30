package slugutil_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
)

func TestNew_AcceptsValidSlug(t *testing.T) {
	slug, err := slugutil.New("acme-corp")

	require.NoError(t, err)
	require.Equal(t, "acme-corp", slug.String())
	require.False(t, slug.IsZero())
}

func TestNew_RejectsInvalidFormat(t *testing.T) {
	tests := []string{
		"",
		"a",
		"-acme",
		"acme-",
		"Acme-Corp",
		"acme_corp",
		"acme corp",
	}

	for _, s := range tests {
		t.Run(s, func(t *testing.T) {
			_, err := slugutil.New(s)
			require.Error(t, err)
			require.True(t, errors.Is(err, slugutil.ErrInvalidSlug))
		})
	}
}

func TestNew_RejectsTooLong(t *testing.T) {
	long := ""
	for range 101 {
		long += "a"
	}

	_, err := slugutil.New(long)
	require.Error(t, err)
	require.True(t, errors.Is(err, slugutil.ErrInvalidSlug))
}

func TestSlug_ZeroValueIsZero(t *testing.T) {
	var slug slugutil.Slug
	require.True(t, slug.IsZero())
	require.Equal(t, "", slug.String())
}

func TestInvalidReason_MentionsRequirements(t *testing.T) {
	reason := slugutil.InvalidReason("Not Valid")
	require.Contains(t, reason, "Not Valid")
	require.Contains(t, reason, slugutil.Requirements)
}
