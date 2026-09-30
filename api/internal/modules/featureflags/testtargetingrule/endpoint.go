package testtargetingrule

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Rehearser is the one facade method this operation calls. Declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close
// a cycle.
type Rehearser interface {
	TestTargetingRule(
		ctx context.Context, cl caller.OrganizationCaller,
		rule, targetingKey string, contextInputs map[string]any,
	) (*Rehearsal, error)
}

type Request struct {
	Body TargetingRuleTrial
}

// TargetingRuleTrial is a rule and the situation to try it against: the
// evaluation context a client would send, plus its targeting key. The context
// may carry the kaiten.instanceSlug/kaiten.instanceId routing hints, which
// resolve instance facts exactly as they would at a real evaluation.
type TargetingRuleTrial struct {
	Context      map[string]any `json:"context,omitempty" doc:"The evaluation context to rehearse against, as a client would send it. Anything under __kaiten is discarded, exactly as at a real evaluation"`
	Rule         string         `json:"rule" example:"__kaiten.license.familySlug == 'scale'" maxLength:"10000" doc:"The CEL targeting rule to rehearse"`
	TargetingKey string         `json:"targetingKey,omitempty" doc:"The key the evaluation would be bucketed on. Resolves license and entitlement facts when it names a customer slug"`
}

type Response struct {
	Body TargetingRuleRehearsal
}

// TargetingRuleRehearsal is what the rehearsal found, in the order an author
// reads it: is the rule well-formed, what did the server see, did it match.
type TargetingRuleRehearsal struct {
	Facts           map[string]any                   `json:"facts" doc:"The __kaiten namespace as enriched for this context — what a rule actually reads. Empty sub-roots mean the context resolved nothing for them"`
	Issues          []featureflag.TargetingRuleIssue `json:"issues" nullable:"false" doc:"Problems the lint found. The rule is only run when there are none"`
	EvaluationError string                           `json:"evaluationError,omitempty" doc:"Why the engine could not answer, when it could not — e.g. the rule reads a host attribute this context does not carry. At a real evaluation the rule would simply not match"`
	Valid           bool                             `json:"valid" doc:"Whether the rule lints clean"`
	Matched         bool                             `json:"matched" doc:"Whether the rule matched this context. Meaningful only when valid and evaluationError is empty"`
}

func RegisterEndpoint(api huma.API, app Rehearser) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "test-targeting-rule",
		Method:      http.MethodPost,
		Path:        "/feature-flags/targeting/test",
		Summary:     "Rehearse a targeting rule against a context",
		Description: "Runs a rule the way an evaluation would, without a flag and without writing anything: " +
			"the context is enriched from the same sources (license, entitlements, instance, customer, " +
			"deployment zone), anything the caller forged under __kaiten is discarded the same way, and " +
			"the same engine answers. The response carries the enriched facts so an author can see " +
			"exactly what the rule read — which is usually the answer to why it did or did not match. " +
			"Nothing is metered or audited: this is authoring, not serving.",
		Tags:   []string{"featureflags"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		rehearsal, err := app.TestTargetingRule(
			ctx, cl, request.Body.Rule, request.Body.TargetingKey, request.Body.Context)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: TargetingRuleRehearsal{
				Valid:           rehearsal.Valid,
				Issues:          rehearsal.Issues,
				Matched:         rehearsal.Matched,
				EvaluationError: rehearsal.EvaluationError,
				Facts:           rehearsal.Facts,
			},
		}, nil
	})
}
