package schema

// RolloutPercentageTargeting represents a weighted distribution across multiple variants
// based on a percentage distribution map.
type RolloutPercentageTargeting struct {
	Type Type   `json:"type" description:"Type of the targeting." enum:"rollout_percentage"`
	Name string `json:"name" example:"Targeting Rule 1234" description:"Name of the targeting."`
	Rule Rule   `json:"rule" example:"user.group == 'beta'" description:"The basicTargeting to evaluate for this targeting. This is a CEL expression that will be evaluated against the user context."`
	RolloutPercentageVariant
}

func (r *RolloutPercentageTargeting) GetRule() Rule   { return r.Rule }
func (r *RolloutPercentageTargeting) GetName() string { return r.Name }

func (r *RolloutPercentageTargeting) GetVariantValue() VariantValue {
	return r.RolloutPercentageVariant
}

func NewRolloutPercentageTargeting(name, rule string, distribution map[string]int64) *RolloutPercentageTargeting {
	valueObject, err := NewRule(rule)
	if err != nil {
		panic("invalid basicTargeting expression: " + err.Error())
	}

	return &RolloutPercentageTargeting{
		Type: RolloutPercentageType,
		Name: name,
		Rule: *valueObject,
		RolloutPercentageVariant: RolloutPercentageVariant{
			RolloutPercentage{
				Distribution: distribution,
			},
		},
	}
}
