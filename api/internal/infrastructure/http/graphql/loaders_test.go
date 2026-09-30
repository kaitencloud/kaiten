package graphql

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	customersGraphql "github.com/kaitencloud/kaiten/api/internal/modules/customers/graphql"
	deploymentzonesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/graphql"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	entitlementsGraphql "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/graphql"
	instancesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/instances/graphql"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licensesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/licenses/graphql"
	releasesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/releases/graphql"
)

// loaderCase is one dataloader as the resolvers see it: the entry point that
// loads through it, and the typed lookup newLoaders has to satisfy for that
// entry point to work.
type loaderCase struct {
	name   string
	load   func(context.Context) error
	lookup func(context.Context) error
}

// loaderCases lists every dataloader the GraphQL resolvers reach for. This
// package is the only one that sees both the modules and the container they
// register into, so it is where "every loader a resolver asks for is a loader
// newLoaders registers" can be checked at all.
func loaderCases() []loaderCase {
	id := uuid.New()

	return []loaderCase{
		{
			name: customersGraphql.CustomerLoaderName,
			load: func(ctx context.Context) error {
				_, err := customersGraphql.LoadCustomer(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := customersGraphql.GetCustomerLoader(ctx)
				return err
			},
		},
		{
			name: customersGraphql.CustomerIntegrationsLoaderName,
			load: func(ctx context.Context) error {
				_, err := customersGraphql.LoadCustomerIntegrations(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := customersGraphql.GetCustomerIntegrationsLoader(ctx)
				return err
			},
		},
		{
			name: deploymentzonesGraphql.DeploymentZoneLoaderName,
			load: func(ctx context.Context) error {
				_, err := deploymentzonesGraphql.LoadDeploymentZone(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := deploymentzonesGraphql.GetDeploymentZoneLoader(ctx)
				return err
			},
		},
		{
			name: entitlementsGraphql.EntitlementBySlugLoaderName,
			load: func(ctx context.Context) error {
				_, err := entitlementsGraphql.LoadEntitlementBySlug(ctx, "number-of-seats")
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := entitlementsGraphql.GetEntitlementBySlugLoader(ctx)
				return err
			},
		},
		{
			name: instancesGraphql.InstancesByCustomerLoaderName,
			load: func(ctx context.Context) error {
				_, err := instancesGraphql.LoadInstancesByCustomer(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := instancesGraphql.GetInstancesByCustomerLoader(ctx)
				return err
			},
		},
		{
			name: instancesGraphql.InstancesByLicenseLoaderName,
			load: func(ctx context.Context) error {
				_, err := instancesGraphql.LoadInstancesByLicense(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := instancesGraphql.GetInstancesByLicenseLoader(ctx)
				return err
			},
		},
		{
			name: instancesGraphql.InstanceIntegrationsLoaderName,
			load: func(ctx context.Context) error {
				_, err := instancesGraphql.LoadInstanceIntegrations(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := instancesGraphql.GetInstanceIntegrationsLoader(ctx)
				return err
			},
		},
		{
			name: instancesGraphql.EntitlementUsageLoaderName,
			load: func(ctx context.Context) error {
				_, err := instancesGraphql.LoadEntitlementUsage(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := instancesGraphql.GetEntitlementUsageLoader(ctx)
				return err
			},
		},
		{
			name: licensesGraphql.LicenseLoaderName,
			load: func(ctx context.Context) error {
				_, err := licensesGraphql.LoadLicense(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := licensesGraphql.GetLicenseLoader(ctx)
				return err
			},
		},
		{
			name: licensesGraphql.LicenseEntitlementsLoaderName,
			load: func(ctx context.Context) error {
				_, err := licensesGraphql.LoadLicenseEntitlements(ctx, id, "enterprise")
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := licensesGraphql.GetLicenseEntitlementsLoader(ctx)
				return err
			},
		},
		{
			name: releasesGraphql.ComponentsByReleaseLoaderName,
			load: func(ctx context.Context) error {
				_, err := releasesGraphql.LoadComponentsByRelease(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := dataloader.GetLoader[uuid.UUID, []componentschema.Component](
					dataloader.LoadersFromContext(ctx),
					releasesGraphql.ComponentsByReleaseLoaderName,
				)
				return err
			},
		},
		{
			name: releasesGraphql.DeploymentZonesByReleaseLoaderName,
			load: func(ctx context.Context) error {
				_, err := releasesGraphql.LoadDeploymentZonesByRelease(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := dataloader.GetLoader[uuid.UUID, []deploymentzoneschema.DeploymentZone](
					dataloader.LoadersFromContext(ctx),
					releasesGraphql.DeploymentZonesByReleaseLoaderName,
				)
				return err
			},
		},
		{
			name: releasesGraphql.InstancesByReleaseLoaderName,
			load: func(ctx context.Context) error {
				_, err := releasesGraphql.LoadInstancesByRelease(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := dataloader.GetLoader[uuid.UUID, []instanceschema.Instance](
					dataloader.LoadersFromContext(ctx),
					releasesGraphql.InstancesByReleaseLoaderName,
				)
				return err
			},
		},
		{
			name: releasesGraphql.DeploymentsByReleaseLoaderName,
			load: func(ctx context.Context) error {
				_, err := releasesGraphql.LoadDeploymentsByRelease(ctx, id)
				return err
			},
			lookup: func(ctx context.Context) error {
				_, err := dataloader.GetLoader[uuid.UUID, []deploymentzoneschema.Deployment](
					dataloader.LoadersFromContext(ctx),
					releasesGraphql.DeploymentsByReleaseLoaderName,
				)
				return err
			},
		},
	}
}

// A context carrying no loaders -- the shape a forgotten registration presents
// -- must name the wiring rather than answer ErrMissingIdentity, or a wiring bug
// reaches the client as an authentication failure.
func TestMissingLoaderIsNotReportedAsAnIdentityProblem(t *testing.T) {
	for _, tt := range loaderCases() {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.load(t.Context())

			require.ErrorIs(t, err, dataloader.ErrLoaderNotRegistered)
			assert.NotContains(t, err.Error(), "missing identity",
				"a missing loader is a wiring bug, not an authentication failure")
		})
	}
}

// TestNewLoadersRegistersEveryLoader is the other half: the error above only
// stays unreachable in production as long as newLoaders registers every
// loader the resolvers ask for, under the name and types they ask for it by.
// A module that forgets a Register call, or registers under a mistyped name,
// fails here rather than at the first query that needs the field.
func TestNewLoadersRegistersEveryLoader(t *testing.T) {
	// newLoaders only builds query structs and batch closures; nothing it
	// does touches the pool, so a zero Handler is enough.
	ctx := dataloader.ContextWithLoaders(t.Context(), (&Handler{}).newLoaders())

	for _, tt := range loaderCases() {
		t.Run(tt.name, func(t *testing.T) {
			require.NoError(t, tt.lookup(ctx))
		})
	}
}
