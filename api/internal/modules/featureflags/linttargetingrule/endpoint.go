package linttargetingrule

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Linter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Linter interface {
	LintTargetingRule(
		ctx context.Context, cl caller.OrganizationCaller, rule string,
	) ([]featureflag.TargetingRuleIssue, error)
}

type Request struct {
	Body TargetingRuleDraft
}

// TargetingRuleDraft is a targeting rule as it is being written: submitted to be
// judged, not to be stored. The length cap matches the one the write path puts
// on a stored rule (schema.Rule), for the reason given there — and it matters
// more here, where every keystroke of every open editor parses its rule twice.
type TargetingRuleDraft struct {
	Rule string `json:"rule" example:"__kaiten.license.familySlug == 'scale'" maxLength:"10000" doc:"The CEL targeting rule to check. May be blank, which is itself a mistake this reports"`
}

type Response struct {
	Body TargetingRuleVerdict
}

/*
TargetingRuleVerdict is what the linter made of a rule.

A rule that does not lint is a *successful* answer to "is this rule any good",
not a failed request: this operation exists to be called on every keystroke
while a rule is being typed, where being told no is the normal case. Answering
422 would turn the ordinary act of typing into a stream of client errors, and
would put the one thing the caller came for — the positions — inside an error
body nobody's generated client models. The 4xx belongs on the write, which
still refuses the same rule with the same words.
*/
type TargetingRuleVerdict struct {
	Issues []featureflag.TargetingRuleIssue `json:"issues" nullable:"false" doc:"Every problem found, positioned where it is written. Empty when the rule is accepted"`
	Valid  bool                             `json:"valid" doc:"Whether the write path would accept this rule"`
}

func RegisterEndpoint(api huma.API, app Linter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "lint-targeting-rule",
		Method:      http.MethodPost,
		Path:        "/feature-flags/targeting/lint",
		Summary:     "Check a targeting rule",
		Description: "Runs the same check create and update run before accepting a targeting rule, and " +
			"reports what it found without writing anything. A rule that references a fact or an " +
			"entitlement that does not exist does not fail loudly at evaluation — it simply never " +
			"matches — so this is what lets an editor say so while the rule is being written. " +
			"A rejected rule is a 200 carrying `valid: false`, not a client error.",
		Tags:   []string{"featureflags"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		issues, err := app.LintTargetingRule(ctx, cl, request.Body.Rule)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: TargetingRuleVerdict{Valid: len(issues) == 0, Issues: issues},
		}, nil
	})
}
