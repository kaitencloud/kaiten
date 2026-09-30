package reportentitlementusagemetric

type Behavior string

const (
	BehaviorAppend Behavior = "append"
	BehaviorSet    Behavior = "set"
)

type Command struct {
	Value    float64        `json:"value"`
	Behavior Behavior       `json:"behavior"`
	Metadata map[string]any `json:"metadata,omitempty"`
}
