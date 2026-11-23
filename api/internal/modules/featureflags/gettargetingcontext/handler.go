package gettargetingcontext

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/common"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. Catalogue reads what the organization has through the
// owning modules' read ports, the same ones the write path lints against.
type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Catalogue    common.Catalogue
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute returns what a targeting rule may read in this organization.
//
// There is no repository: the shape is derived from the fact structs by
// featureflag.TargetingContextRoots, and the only thing that varies per
// organization is what its catalogue holds — entitlement slugs, plans, license
// versions and deployment zones — which the catalogue ports already read.
// Nothing here is metered — this answers an editor opening a form, not a flag
// evaluation, and counting it as one would inflate the number that bills.
func (h *UseCase) Execute(ctx context.Context) ([]featureflag.TargetingContextNode, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)

	known := h.deps.Catalogue.Read(ctx, user.OrganizationID)

	return featureflag.TargetingContextRoots(known), nil
}
