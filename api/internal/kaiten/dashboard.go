package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard"
	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/getsummary"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// Dashboard is the dashboard module's one operation: the console's home.
type Dashboard struct {
	uc *dashboard.UseCases
}

// Dashboard returns the dashboard surface.
func (k *Kaiten) Dashboard() Dashboard {
	return Dashboard{uc: k.modules.Dashboard}
}

// GetSummary computes the organization's summary for rng. The operation needs
// read:customers, read:instances and read:licenses, which every row of the
// home is made of; each other block is included only when the caller holds
// its module's read scope, so a narrow role still gets its home, minus what
// it may not see.
func (d Dashboard) GetSummary(
	ctx context.Context, cl caller.OrganizationCaller, rng getsummary.Range,
) (*getsummary.DashboardSummary, error) {
	if err := cl.Require(getsummary.RequiredScope); err != nil {
		return nil, err
	}
	if err := cl.Require(scope.Read(scope.Instances)); err != nil {
		return nil, err
	}
	if err := cl.Require(scope.Read(scope.Licenses)); err != nil {
		return nil, err
	}

	may := func(module scope.Module) bool { return cl.Require(scope.Read(module)) == nil }
	return d.uc.GetSummary.Execute(bindOrganization(ctx, cl), getsummary.Query{
		Range: rng,
		Visibility: getsummary.Visibility{
			FeatureFlags:    may(scope.FeatureFlags),
			Releases:        may(scope.Releases),
			DeploymentZones: may(scope.DeploymentZones),
			Tokens:          may(scope.Tokens),
			PublishableKeys: may(scope.PublishableKeys),
			Connectors:      may(scope.Organizations),
			Billing:         may(scope.Billing),
		},
	})
}
