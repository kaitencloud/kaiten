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
	// TransactionID is the client's idempotency key, nil when the report
	// carries none. The endpoint has checked its format.
	TransactionID *string `json:"transactionId,omitempty"`
}
