package createrelease

import (
	"regexp"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestResolveReleaseSlug_GeneratesValidSlugFromVersion(t *testing.T) {
	t.Helper()

	slug, err := resolveReleaseSlug(nil, "Release v1.2.3")

	require.NoError(t, err)
	require.True(t, slugutil.Validate(slug))
	require.True(t, regexp.MustCompile(`^release-v1-2-3-[a-f0-9]{6}$`).MatchString(slug))
}

func TestResolveReleaseSlug_UsesProvidedValidSlug(t *testing.T) {
	t.Helper()

	provided := "release-v1-2-3"

	slug, err := resolveReleaseSlug(&provided, "Release v1.2.3")

	require.NoError(t, err)
	require.Equal(t, provided, slug)
}

func TestResolveReleaseSlug_RejectsInvalidSlug(t *testing.T) {
	t.Helper()

	provided := "Invalid Slug"

	_, err := resolveReleaseSlug(&provided, "Release v1.2.3")

	require.Error(t, err)
	require.Equal(t, "CreateRelease.InvalidSlug", kaitenerrors.GetCode(err))
}

func TestDedupeComponentIDs_RemovesDuplicatesAndPreservesOrder(t *testing.T) {
	t.Helper()

	componentA := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	componentB := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	componentC := uuid.MustParse("33333333-3333-3333-3333-333333333333")

	deduped := dedupeComponentIDs([]uuid.UUID{
		componentA,
		componentB,
		componentA,
		componentC,
		componentB,
	})

	require.Equal(t, []uuid.UUID{componentA, componentB, componentC}, deduped)
}
