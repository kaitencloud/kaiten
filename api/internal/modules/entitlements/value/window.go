package value

import (
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

// ResolveCurrentWindowUsage applies the lazy-read semantics for a NUMBER
// entitlement configured with a periodic reset: if
// storedPeriodStart equals currentWindow.Start, the stored row belongs to
// the active window and is returned unchanged; otherwise -- a stale prior
// window, a legacy lifetime row (storedPeriodStart nil), or no stored row
// at all -- it returns a fresh {0,0} value. This performs no writes; a
// stale row remains physically stored until the next report rolls it over.
// Shared by every usage read path so this decision is made exactly once.
// Callers must only call this when the entitlement has a configured reset
// period -- lifetime entitlements have no window to resolve against.
func ResolveCurrentWindowUsage(stored *NumberUsageValue, storedPeriodStart *time.Time, currentWindow period.Window) *NumberUsageValue {
	if stored != nil && storedPeriodStart != nil && storedPeriodStart.Equal(currentWindow.Start) {
		return stored
	}
	return NewDefaultNumberUsageValue()
}
