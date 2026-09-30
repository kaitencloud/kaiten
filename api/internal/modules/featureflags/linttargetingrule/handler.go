package linttargetingrule

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/common"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. EntitlementCatalogue is the entitlements module's read
// port — the same one create and update lint against, which is the whole
// reason this check cannot run in the browser.
type Deps struct {
	UserProvider         currentuser.Provider
	EntitlementCatalogue catalogue.Port
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute reports every problem in rule, positioned where it is written.
//
// It runs featureflag.LintTargetingRuleIssues — literally the pass create and
// update run before accepting a flag — so a rule this reports clean is a rule
// the write path accepts. Anything less would make the editor a second, weaker
// description of the rules, which is what the console's hand-written variable
// list was.
func (h *UseCase) Execute(ctx context.Context, rule string) ([]featureflag.TargetingRuleIssue, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	slugs := common.EntitlementSlugs(ctx, h.deps.EntitlementCatalogue, user.OrganizationID)

	return featureflag.LintTargetingRuleIssues(rule, slugs), nil
}
