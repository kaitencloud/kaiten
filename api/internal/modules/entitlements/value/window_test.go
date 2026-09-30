package value

import (
	"testing"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

func TestResolveCurrentWindowUsage(t *testing.T) {
	windowStart := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	window := period.Window{Start: windowStart, End: time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)}
	stored := &NumberUsageValue{Type: TypeNumber, Value: 42, EventCount: 3}

	t.Run("fresh row matching current window returns stored value unchanged", func(t *testing.T) {
		start := windowStart
		got := ResolveCurrentWindowUsage(stored, &start, window)
		if got != stored {
			t.Errorf("ResolveCurrentWindowUsage() = %+v, want the exact stored pointer %+v", got, stored)
		}
	})

	t.Run("stale row from a prior window returns a fresh zero value", func(t *testing.T) {
		staleStart := windowStart.AddDate(0, -1, 0)
		got := ResolveCurrentWindowUsage(stored, &staleStart, window)
		if got.Value != 0 || got.EventCount != 0 {
			t.Errorf("ResolveCurrentWindowUsage() = %+v, want {0,0}", got)
		}
	})

	t.Run("legacy nil period_start (lifetime-accumulated row) returns a fresh zero value", func(t *testing.T) {
		got := ResolveCurrentWindowUsage(stored, nil, window)
		if got.Value != 0 || got.EventCount != 0 {
			t.Errorf("ResolveCurrentWindowUsage() = %+v, want {0,0}", got)
		}
	})

	t.Run("no stored row at all returns a fresh zero value", func(t *testing.T) {
		got := ResolveCurrentWindowUsage(nil, nil, window)
		if got.Value != 0 || got.EventCount != 0 {
			t.Errorf("ResolveCurrentWindowUsage() = %+v, want {0,0}", got)
		}
	})
}
