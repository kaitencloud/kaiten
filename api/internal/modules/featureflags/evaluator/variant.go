package evaluator

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

// evaluateVariant decides which variant name a schema.VariantValue resolves to
// for the given context. schema.VariantValue only advertises the variant
// names a shape can produce (see its doc comment) — deciding which one
// applies, and why, is evaluation logic, so it lives here rather than as a
// method on the domain type.
//
// flagKey salts every bucket assignment below it, so two flags rolling out at
// the same percentage do not pick the same subjects (see
// featureflag.bucketOf). It is the flag's slug: unique per organization,
// stable for the flag's lifetime, and already the identifier the OFREP caller
// asked for the flag by.
func evaluateVariant(flagKey string, v schema.VariantValue, ctx openfeature.EvaluationContext) EvaluationResult {
	switch vv := v.(type) {
	case schema.BasicVariant:
		return EvaluationResult{variantName: string(vv), reason: openfeature.ReasonStatic}
	case *schema.BasicVariant:
		return EvaluationResult{variantName: string(*vv), reason: openfeature.ReasonStatic}

	case schema.RolloutDateVariant:
		return evaluateRolloutDateVariant(flagKey, vv, ctx)
	case *schema.RolloutDateVariant:
		return evaluateRolloutDateVariant(flagKey, *vv, ctx)

	case schema.RolloutPercentageVariant:
		return evaluateRolloutPercentageVariant(flagKey, vv, ctx)
	case *schema.RolloutPercentageVariant:
		return evaluateRolloutPercentageVariant(flagKey, *vv, ctx)

	default:
		return EvaluationResult{}
	}
}

func evaluateRolloutDateVariant(flagKey string, r schema.RolloutDateVariant, ctx openfeature.EvaluationContext) EvaluationResult {
	variantName := featureflag.ResolveRolloutDate(
		flagKey, ctx.TargetingKey,
		float64(r.Start.Percentage), float64(r.End.Percentage),
		r.Start.Date, r.End.Date,
		r.Start.Variant, r.End.Variant,
	)

	return EvaluationResult{variantName: variantName, reason: openfeature.ReasonSplit}
}

func evaluateRolloutPercentageVariant(flagKey string, r schema.RolloutPercentageVariant, ctx openfeature.EvaluationContext) EvaluationResult {
	variantName := featureflag.AssignByWeightedDistribution(flagKey, ctx.TargetingKey, r.Distribution)

	return EvaluationResult{variantName: variantName, reason: openfeature.ReasonSplit}
}
