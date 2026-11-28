package reportentitlementusagemetric

import (
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
)

// Behavior is how a numeric report treats the stored counter.
type Behavior = usage.Behavior

const (
	BehaviorAppend = usage.Append
	BehaviorSet    = usage.Set
)

type Command struct {
	AI       *schema.AiUsageValue `json:"ai,omitempty"`
	Value    float64              `json:"value"`
	Behavior Behavior             `json:"behavior"`
	Metadata map[string]any       `json:"metadata,omitempty"`
	// TransactionID is the client's idempotency key, nil when the report
	// carries none. The endpoint has checked its format.
	TransactionID *string `json:"transactionId,omitempty"`
	// ResourceKey is the resource the report counts for: set by the resource
	// route, nil by the entitlement's own. The endpoint has checked its format;
	// whether the entitlement counts per resource is checked under the pair's
	// lock, with the entitlement in hand.
	ResourceKey *string `json:"resourceKey,omitempty"`
}
