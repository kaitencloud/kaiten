package schema

// BasicTargeting represents a simple targeting basicTargeting that returns a specific variant
// when the CEL basicTargeting evaluates to true.
type BasicTargeting struct {
	Type    Type         `json:"type" description:"Type of the targeting." enum:"basic"`
	Name    string       `json:"name" example:"Targeting Rule 1" description:"Name of the targeting."`
	Variant BasicVariant `json:"variant" description:"The variant to apply when the rule matches."`
	Rule    Rule         `json:"rule" example:"user.group == 'beta'" description:"The rule to evaluate for this targeting. This is a CEL expression that will be evaluated against the user context."`
}

func (b *BasicTargeting) GetRule() Rule   { return b.Rule }
func (b *BasicTargeting) GetName() string { return b.Name }

func (b *BasicTargeting) GetVariantValue() VariantValue {
	return b.Variant
}

func NewBasicTargeting(name, rule, variant string) *BasicTargeting {
	valueObject, err := NewRule(rule)
	if err != nil {
		panic("invalid basicTargeting expression: " + err.Error())
	}

	return &BasicTargeting{
		Type:    BasicType,
		Name:    name,
		Rule:    *valueObject,
		Variant: BasicVariant(variant),
	}
}
