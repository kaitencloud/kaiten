package gettargetingcontext

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/common"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. EntitlementCatalogue is the entitlements module's
// read port, the same one the write path lints slugs against.
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

// Execute returns what a targeting rule may read in this organization.
//
// There is no repository: the shape is derived from the fact structs by
// featureflag.TargetingContextRoots, and the only thing that varies per
// organization is its entitlement slugs, which the catalogue port already
// reads. Nothing here is metered — this answers an editor opening a form, not
// a flag evaluation, and counting it as one would inflate the number that
// bills.
func (h *UseCase) Execute(ctx context.Context) ([]featureflag.TargetingContextNode, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	slugs := common.EntitlementSlugs(ctx, h.deps.EntitlementCatalogue, user.OrganizationID)

	return featureflag.TargetingContextRoots(slugs), nil
}
