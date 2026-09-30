package schema

// VariantValue is implemented by every concrete variant shape (BasicVariant,
// RolloutDateVariant, RolloutPercentageVariant). It only exposes the variant
// names a shape can produce -- deciding which one applies for a given
// evaluation context is the evaluator package's job, not this type's.
type VariantValue interface {
	GetVariants() []string
}

// VariantsHolder represents any type that holds variant references.
type VariantsHolder interface {
	GetVariantValue() VariantValue
}

// BasicVariant represents a simple variant with a string Value
type BasicVariant string

func (b BasicVariant) GetVariants() []string {
	return []string{string(b)}
}

// RolloutDateVariant represents a date-based rollout variant
type RolloutDateVariant struct {
	RolloutDate
}

func (r RolloutDateVariant) GetVariants() []string {
	return r.Variants()
}

// RolloutPercentageVariant represents a percentage-based rollout variant
type RolloutPercentageVariant struct {
	RolloutPercentage
}

func (r RolloutPercentageVariant) GetVariants() []string {
	return r.Variants()
}
