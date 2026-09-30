package schema

// RolloutDateTargeting represents a time-based gradual rollout that progressively
// transitions from a start variant to an end variant over a date range.
type RolloutDateTargeting struct {
	Type Type   `json:"type" description:"Type of the targeting" enum:"rollout_date"`
	Name string `json:"name" example:"Targeting Rule 1" description:"Name of the targeting."`
	Rule Rule   `json:"rule" example:"user.group == 'beta'" description:"The rule to evaluate for this targeting. This is a CEL expression that will be evaluated against the user context."`
	RolloutDateVariant
}

func (r *RolloutDateTargeting) GetRule() Rule   { return r.Rule }
func (r *RolloutDateTargeting) GetName() string { return r.Name }

func (r *RolloutDateTargeting) GetVariantValue() VariantValue {
	return r.RolloutDateVariant
}

func NewRolloutDateTargeting(name, rule string, start, end *RolloutStep) *RolloutDateTargeting {
	valueObject, err := NewRule(rule)
	if err != nil {
		panic("invalid basicTargeting expression: " + err.Error())
	}

	return &RolloutDateTargeting{
		Type: RolloutDateType,
		Name: name,
		Rule: *valueObject,
		RolloutDateVariant: RolloutDateVariant{
			RolloutDate{
				Start: *start,
				End:   *end,
			},
		},
	}
}
