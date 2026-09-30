package schema

import (
	"encoding/json"
	"errors"
	"fmt"
)

type DefaultVariant struct {
	Type  Type         `json:"type" description:"Type of the variant" enum:"basic,rollout_date,rollout_percentage"`
	Value VariantValue `json:"value"`
}

func (d *DefaultVariant) GetVariantValue() VariantValue {
	return d.Value
}

func (d *DefaultVariant) UnmarshalJSON(data []byte) error {
	var hdr struct {
		Type Type `json:"type"`
	}

	if err := json.Unmarshal(data, &hdr); err != nil {
		return err
	}
	if hdr.Type == "" {
		return errors.New("default_variant.type is required")
	}

	d.Type = hdr.Type

	switch hdr.Type {
	case BasicType:
		var payload struct {
			Type  Type   `json:"type"`
			Value string `json:"value"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			return err
		}
		v := BasicVariant(payload.Value)
		d.Value = &v
		return nil

	case RolloutPercentageType:
		var payload struct {
			Type         Type             `json:"type"`
			Distribution map[string]int64 `json:"distribution"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			return err
		}
		p := RolloutPercentageVariant{RolloutPercentage: RolloutPercentage{Distribution: payload.Distribution}}
		d.Value = &p
		return nil

	case RolloutDateType:
		var payload struct {
			Type  Type        `json:"type"`
			Start RolloutStep `json:"start"`
			End   RolloutStep `json:"end"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			return err
		}
		dv := RolloutDateVariant{RolloutDate: RolloutDate{Start: payload.Start, End: payload.End}}
		d.Value = &dv
		return nil
	default:
		return errors.New("unknown variant type: " + string(hdr.Type))
	}
}

func (d *DefaultVariant) MarshalJSON() ([]byte, error) {
	if d.Value == nil {
		return nil, errors.New("variant Value is nil while marshal")
	}

	switch d.Type {
	case BasicType:
		var v string
		switch vv := d.Value.(type) {
		case BasicVariant:
			v = string(vv)
		case *BasicVariant:
			v = string(*vv)
		default:
			return nil, fmt.Errorf("invalid basic variant Value: got %T", d.Value)
		}
		return json.Marshal(struct {
			Type  Type   `json:"type"`
			Value string `json:"value"`
		}{Type: d.Type, Value: v})

	case RolloutPercentageType:
		var dist map[string]int64
		switch vv := d.Value.(type) {
		case RolloutPercentageVariant:
			dist = vv.Distribution
		case *RolloutPercentageVariant:
			dist = vv.Distribution
		default:
			return nil, fmt.Errorf("invalid rollout percentage variant Value: got %T", d.Value)
		}
		return json.Marshal(struct {
			Type         Type             `json:"type"`
			Distribution map[string]int64 `json:"distribution"`
		}{Type: d.Type, Distribution: dist})

	case RolloutDateType:
		var start, end RolloutStep
		switch vv := d.Value.(type) {
		case RolloutDateVariant:
			start, end = vv.Start, vv.End
		case *RolloutDateVariant:
			start, end = vv.Start, vv.End
		default:
			return nil, fmt.Errorf("invalid rollout date variant Value: got %T", d.Value)
		}
		return json.Marshal(struct {
			Type  Type        `json:"type"`
			Start RolloutStep `json:"start"`
			End   RolloutStep `json:"end"`
		}{Type: d.Type, Start: start, End: end})
	default:
		return nil, errors.New("unknown variant type")
	}
}
