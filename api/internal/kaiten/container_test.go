package kaiten

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkoutsweep"
)

// A billing job that runs before the checkout sweep is bound waits for it:
// skipping would let a sync pass move its cursor past the provider's event.
func TestLateCheckoutSweeperWaitsForItsBinding(t *testing.T) {
	late := newLateCheckoutSweeper()
	target := checkoutsweep.New(checkoutsweep.Deps{})

	got := make(chan *checkoutsweep.Sweep, 1)
	go func() {
		sweep, err := late.get(t.Context())
		assert.NoError(t, err)
		got <- sweep
	}()

	select {
	case <-got:
		t.Fatal("the sweep was handed out before it was bound")
	case <-time.After(20 * time.Millisecond):
	}
	late.bind(target)
	select {
	case sweep := <-got:
		require.Same(t, target, sweep)
	case <-time.After(time.Second):
		t.Fatal("the binding did not release the waiting job")
	}

	late.bind(checkoutsweep.New(checkoutsweep.Deps{}))
	sweep, err := late.get(t.Context())
	require.NoError(t, err)
	require.Same(t, target, sweep, "the first binding holds")
}

func TestLateCheckoutSweeperGivesUpWithItsContext(t *testing.T) {
	late := newLateCheckoutSweeper()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := late.get(ctx)
	require.ErrorIs(t, err, context.Canceled)
	_, err = late.Abandon(ctx, 1)
	require.ErrorIs(t, err, context.Canceled)
}
