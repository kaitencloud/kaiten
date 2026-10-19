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
}
