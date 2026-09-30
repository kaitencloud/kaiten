// Package evaluator resolves a feature flag's variant for a given evaluation
// context: it walks targeting rules, evaluates each one's CEL expression via
// the infra CEL engine, and dispatches to the matched (or default) variant's
// value-resolution logic.
package evaluator

import (
	"context"
	"fmt"
	"log/slog"
	"maps"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

// Evaluator orchestrates feature flag evaluation
type Evaluator struct {
	engine *featureflag.Engine
}

// EvaluationResult represents the result of a targeting evaluation
type EvaluationResult struct {
	variantName     string
	reason          openfeature.Reason
	matchedRuleName string
}

func NewEvaluator() *Evaluator {
	return &Evaluator{}
}

// Evaluate executes feature flag resolution and returns detailed evaluation
// metadata.
//
// `ctx` is the request context. Each rule runs under it, so a deadline or a
// cancellation the request carries stops a rule still iterating; and a rule
// that could not run is logged with the same trace fields as the rest of the
// request — a warning nobody can tie back to a caller is most of the way to the
// silence this reporting exists to end. `evalCtx` is the targeting context
// being judged.
func (e *Evaluator) Evaluate(
	ctx context.Context,
	flag schema.FeatureFlag,
	evalCtx openfeature.EvaluationContext,
) (openfeature.ResolutionDetails, error) {
	if !flag.Enabled {
		return e.handleDisabledFlag(flag, evalCtx), nil
	}

	if err := evalCtx.Validate(); err != nil {
		return e.handleError(flag, evalCtx, openfeature.ErrorCodeProviderFatal, err), nil
	}

	if err := e.initializeRuleEngine(evalCtx); err != nil {
		return e.handleError(flag, evalCtx, openfeature.ErrorCodeProviderFatal, err), nil
	}

	matched, result, brokenRules := e.evaluateTargetings(ctx, flag, evalCtx)
	if matched {
		details := openfeature.NewSuccessResolutionDetails(flag.GetVariantSet(), flag.Metadata, flag.Type, result.variantName, result.reason)
		details.MatchedRuleName = &result.matchedRuleName
		reportBrokenRules(ctx, flag, brokenRules, &details)
		return details, nil
	}

	details := e.handleDefaultVariant(flag, evalCtx)
	reportBrokenRules(ctx, flag, brokenRules, &details)

	return details, nil
}

// BrokenRule is a targeting rule that could not be evaluated: a syntax error, a
// reference to a key the context does not carry, a type mismatch.
type BrokenRule struct {
	Name string
	Rule string
	Err  error
}

/*
reportBrokenRules makes a rule that could not run visible, without changing what
is served.

The flag still falls through to its default — one mistyped rule must not fail a
bulk evaluation for every flag and every tenant. But it used to fall through in
complete silence, because a rule that ERRORED and a rule that did not MATCH were
collapsed into the same branch. A `entitlements['sieges']` typo simply meant the
feature was never enabled, with nothing to read anywhere: no error, no error
code, no log.

So the value is left alone and the failure is attached to it — in the log, and
in the flag metadata the OFREP response carries back to the caller who wrote the
rule.
*/
func reportBrokenRules(
	ctx context.Context,
	flag schema.FeatureFlag,
	broken []BrokenRule,
	details *openfeature.ResolutionDetails,
) {
	if len(broken) == 0 {
		return
	}

	messages := make([]string, 0, len(broken))
	for _, rule := range broken {
		messages = append(messages, fmt.Sprintf("%s: %s", rule.Name, rule.Err))
		slog.WarnContext(
			ctx, "feature flag targeting rule could not be evaluated",
			"flag", flag.Slug,
			"rule_name", rule.Name,
			"rule", rule.Rule,
			"error", rule.Err,
		)
	}

	metadata := map[string]any{}
	if details.FlagMetadata != nil {
		maps.Copy(metadata, *details.FlagMetadata)
	}
	metadata[BrokenRulesMetadataKey] = messages
	details.FlagMetadata = &metadata
}

// BrokenRulesMetadataKey is where the OFREP response reports rules that failed
// to evaluate, so a console or an SDK can show them next to the flag.
const BrokenRulesMetadataKey = "kaiten.brokenTargetingRules"

func (e *Evaluator) handleDisabledFlag(flag schema.FeatureFlag, ctx openfeature.EvaluationContext) openfeature.ResolutionDetails {
	result := evaluateDefaultVariant(flag, ctx)

	return openfeature.NewSuccessResolutionDetails(flag.GetVariantSet(), flag.Metadata, flag.Type, result.variantName, openfeature.ReasonDisabled)
}

// evaluateDefaultVariant resolves the flag's default variant, or resolves to
// nothing when the flag has none.
//
// The database column is NOT NULL, so a flag that came from there always has
// one — but all three fallback paths dereferenced it and only then tested it
// for nil, which makes the one guard that exists decorative and leaves the
// first in-memory-constructed flag to discover the panic.
func evaluateDefaultVariant(flag schema.FeatureFlag, ctx openfeature.EvaluationContext) EvaluationResult {
	if flag.DefaultVariant == nil {
		return EvaluationResult{}
	}

	return evaluateVariant(flag.Slug, flag.DefaultVariant.GetVariantValue(), ctx)
}

func (e *Evaluator) initializeRuleEngine(ctx openfeature.EvaluationContext) error {
	engine, err := featureflag.NewEngine(ctx)
	if err != nil {
		return fmt.Errorf("failed to initialize CEL Engine: %w", err)
	}
	e.engine = engine
	return nil
}

func (e *Evaluator) handleError(flag schema.FeatureFlag, ctx openfeature.EvaluationContext, code openfeature.ErrorCode, err error) openfeature.ResolutionDetails {
	result := evaluateDefaultVariant(flag, ctx)

	return openfeature.NewFailureResolutionDetails(flag.GetVariantSet(), flag.Metadata, flag.Type, result.variantName, code, err.Error())
}

func (e *Evaluator) evaluateTargetings(
	ctx context.Context,
	flag schema.FeatureFlag,
	evalCtx openfeature.EvaluationContext,
) (bool, *EvaluationResult, []BrokenRule) {
	var broken []BrokenRule

	for _, targeting := range flag.Targetings {
		matched, err := e.engine.EvaluateRule(ctx, targeting.GetRule().Value)
		// A rule that could not run is not a rule that said no — the caller has
		// to be able to tell the two apart.
		if err != nil {
			broken = append(broken, BrokenRule{
				Name: targeting.GetName(),
				Rule: targeting.GetRule().Value,
				Err:  err,
			})
			continue
		}

		if !matched {
			continue
		}

		result := evaluateVariant(flag.Slug, targeting.GetVariantValue(), evalCtx)

		if result.reason == openfeature.ReasonStatic {
			result.reason = openfeature.ReasonTargetingMatch
		}

		if result.variantName == "" {
			continue
		}

		result.matchedRuleName = targeting.GetName()
		return true, &result, broken
	}
	return false, nil, broken
}

func (e *Evaluator) handleDefaultVariant(flag schema.FeatureFlag, ctx openfeature.EvaluationContext) openfeature.ResolutionDetails {
	result := evaluateDefaultVariant(flag, ctx)

	reason := openfeature.ReasonDefault
	if len(flag.Targetings) == 0 && flag.DefaultVariant != nil {
		reason = result.reason
	}

	return openfeature.NewSuccessResolutionDetails(flag.GetVariantSet(), flag.Metadata, flag.Type, result.variantName, reason)
}
