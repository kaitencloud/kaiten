package targetorg

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

func TestContextWithTarget_RoundTrip(t *testing.T) {
	want := uuid.New()

	got, ok := FromContext(ContextWithTarget(context.Background(), want))

	require.True(t, ok)
	assert.Equal(t, want, got)
}

func TestFromContext_Miss(t *testing.T) {
	got, ok := FromContext(context.Background())

	assert.False(t, ok, "an untouched context reported a target organization")
	assert.Equal(t, uuid.Nil, got)
}

// A nil context is what a handler called outside a request sees. It must not
// panic, and it must not claim to have a target.
func TestNilContext(t *testing.T) {
	assert.Nil(t, ContextWithTarget(nil, uuid.New())) //nolint:staticcheck // nil ctx is the case under test

	got, ok := FromContext(nil) //nolint:staticcheck // nil ctx is the case under test
	assert.False(t, ok)
	assert.Equal(t, uuid.Nil, got)
}

// uuid.Nil already means "no target", so storing it must not make FromContext
// report one. Otherwise a middleware that failed to parse its path parameter
// would install a target every consumer reads as a missing organization.
func TestContextWithTarget_NilUUIDIsNotATarget(t *testing.T) {
	got, ok := FromContext(ContextWithTarget(context.Background(), uuid.Nil))

	assert.False(t, ok, "uuid.Nil was stored as a target organization")
	assert.Equal(t, uuid.Nil, got)
}

// The last target wins, so a nested route cannot be shadowed by an outer one.
func TestContextWithTarget_Overrides(t *testing.T) {
	first, second := uuid.New(), uuid.New()

	got, ok := FromContext(
		ContextWithTarget(ContextWithTarget(context.Background(), first), second),
	)

	require.True(t, ok)
	assert.Equal(t, second, got)
}

// The whole reason this package exists: the target and the actor are two slots.
// Setting one must be invisible to the other's accessor, in both directions.
func TestTargetAndPrincipalAreIndependentSlots(t *testing.T) {
	target := uuid.New()

	t.Run("a target does not become an actor organization", func(t *testing.T) {
		ctx := ContextWithTarget(context.Background(), target)

		_, ok := principal.FromContext(ctx)
		assert.False(t, ok, "a target organization was readable as a principal")
	})

	t.Run("an actor organization is not a target", func(t *testing.T) {
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind:           principal.KindOrganization,
			OrganizationID: uuid.New(),
		})

		_, ok := FromContext(ctx)
		assert.False(t, ok, "an actor's organization was readable as a target")
	})

	t.Run("both together stay distinct", func(t *testing.T) {
		actor := &principal.Principal{Kind: principal.KindPlatform, OrganizationID: uuid.Nil}
		ctx := ContextWithTarget(
			principal.ContextWithPrincipal(context.Background(), actor), target,
		)

		gotTarget, ok := FromContext(ctx)
		require.True(t, ok)
		assert.Equal(t, target, gotTarget)

		gotActor, ok := principal.FromContext(ctx)
		require.True(t, ok)
		assert.Equal(t, uuid.Nil, gotActor.OrganizationID,
			"setting a target changed the actor's organization")
	})
}
