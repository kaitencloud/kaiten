package schema

import (
	"encoding/json"
	"errors"
)

// TargetingRule is an interface for all targeting basicTargeting types.
type TargetingRule interface {
	VariantsHolder
	GetRule() Rule
	GetName() string
}

// Targetings is a slice of TargetingRule that supports custom JSON unmarshaling
// to handle polymorphic targeting types.
type Targetings []TargetingRule

func (t *Targetings) UnmarshalJSON(data []byte) error {
	var rawItems []json.RawMessage
	if err := json.Unmarshal(data, &rawItems); err != nil {
		return err
	}

	for _, raw := range rawItems {
		var typeHolder struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &typeHolder); err != nil {
			return err
		}

		var item TargetingRule
		switch typeHolder.Type {
		case string(BasicType):
			var rule BasicTargeting
			if err := json.Unmarshal(raw, &rule); err != nil {
				return err
			}
			item = &rule
		case string(RolloutDateType):
			var dateTarget RolloutDateTargeting
			if err := json.Unmarshal(raw, &dateTarget); err != nil {
				return err
			}
			item = &dateTarget
		case string(RolloutPercentageType):
			var percentageTarget RolloutPercentageTargeting
			if err := json.Unmarshal(raw, &percentageTarget); err != nil {
				return err
			}
			item = &percentageTarget
		default:
			return errors.New("unknown targeting type: " + typeHolder.Type)
		}

		*t = append(*t, item)
	}
	return nil
}
