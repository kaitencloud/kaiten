package testtargetingrule

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	deploymentzonetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	instancetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/instances/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container: the catalogue the lint checks slugs against, and the
// three fact ports the real evaluation path enriches from.
type Deps struct {
	UserProvider         currentuser.Provider
	EntitlementCatalogue catalogue.Port
	CustomerFacts        customertargetingfacts.Port
	InstanceFacts        instancetargetingfacts.Port
	DeploymentZoneFacts  deploymentzonetargetingfacts.Port
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Rehearsal is one dry run of a rule: what the linter said, what the server
// computed for the given context, and — when the rule lints clean — whether it
// matched.
type Rehearsal struct {
	// Facts is the __kaiten namespace as the enrichment produced it for this
	// context: what a rule actually reads, which is usually the answer to why
	// it did or did not match.
	Facts map[string]any

	Issues []featureflag.TargetingRuleIssue
	// EvaluationError is why the engine could not answer, when it could not —
	// e.g. a host attribute the rule reads that the context does not carry.
	// At a real evaluation this outcome is not an error: the rule simply does
	// not match and the flag falls through to its default variant.
	EvaluationError string

	Valid   bool
	Matched bool
}

/*
Execute rehearses rule against a context, exactly the way an evaluation would
read it.

The sequence is the OFREP handler's, deliberately: reset the facts namespace
(so a forged __kaiten in the trial context is discarded here the way it would
be in production — a rehearsal that let it through would "prove" a rule that
can never really match), then enrich from the same ports, then run the same
engine. A rehearsal that took any shortcut would be one more description of
evaluation free to drift from it.

Nothing here is metered and nothing is published to the audit trail: this is
an author trying a rule out, not a client being served a flag.
*/
func (h *UseCase) Execute(
	ctx context.Context, rule, targetingKey string, contextInputs map[string]any,
) (*Rehearsal, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	evaluationContext := openfeature.EvaluationContext{
		TargetingKey: targetingKey,
		Inputs:       contextInputs,
	}
	ofrep.ResetKaitenFacts(&evaluationContext)
	ofrep.EnrichWithServerFacts(ctx, h.deps.CustomerFacts, user.OrganizationID, &evaluationContext)
	ofrep.EnrichWithInstanceFacts(ctx, h.deps.InstanceFacts, h.deps.CustomerFacts, h.deps.DeploymentZoneFacts, user.OrganizationID, &evaluationContext)

	rehearsal := &Rehearsal{
		Facts:  factsOf(evaluationContext),
		Issues: featureflag.LintTargetingRuleIssues(rule, common.EntitlementSlugs(ctx, h.deps.EntitlementCatalogue, user.OrganizationID)),
	}
	rehearsal.Valid = len(rehearsal.Issues) == 0

	// A rule that does not lint is not run: its verdict is the issues, and
	// whatever the engine would say about it is noise.
	if !rehearsal.Valid {
		return rehearsal, nil
	}

	engine, err := featureflag.NewEngine(evaluationContext)
	if err != nil {
		return nil, err
	}

	matched, err := engine.EvaluateRule(ctx, rule)
	if err != nil {
		rehearsal.EvaluationError = err.Error()
		return rehearsal, nil
	}

	rehearsal.Matched = matched

	return rehearsal, nil
}

// factsOf reads the enriched facts namespace back out, for the author to see.
func factsOf(ec openfeature.EvaluationContext) map[string]any {
	facts, _ := ec.Inputs[ofrep.KaitenFactsNamespace].(map[string]any)
	if facts == nil {
		facts = map[string]any{}
	}

	return facts
}
