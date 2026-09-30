package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	deploymentzonereleaselink "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/releaselink"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	instancereleaselink "github.com/kaitencloud/kaiten/api/internal/modules/instances/releaselink"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

const (
	ComponentsByReleaseLoaderName      = "ComponentsByReleaseLoader"
	DeploymentZonesByReleaseLoaderName = "DeploymentZonesByReleaseLoader"
	InstancesByReleaseLoaderName       = "InstancesByReleaseLoader"
	DeploymentsByReleaseLoaderName     = "DeploymentsByReleaseLoader"
)

// RegisterDataloaders registers release dataloaders to the shared loaders
// container. componentLink, deploymentZoneLink and instanceLink are the
// owning modules' own public read ports -- this package never imports their
// generated db packages directly.
func RegisterDataloaders(
	loaders *dataloader.Loaders,
	componentLink releaselink.Port,
	deploymentZoneLink deploymentzonereleaselink.Port,
	instanceLink instancereleaselink.Port,
) {
	loaders.Register(ComponentsByReleaseLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(
			loaders,
			dogfooding.ComponentReadEntitlementSlug,
			newComponentsByReleaseBatchFn(componentLink),
		),
	))
	loaders.Register(DeploymentZonesByReleaseLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(
			loaders,
			dogfooding.DeploymentZoneReadEntitlementSlug,
			newDeploymentZonesByReleaseBatchFn(deploymentZoneLink),
		),
	))
	loaders.Register(InstancesByReleaseLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(
			loaders,
			dogfooding.InstanceReadEntitlementSlug,
			newInstancesByReleaseBatchFn(instanceLink),
		),
	))
	// Release.deployments has no REST equivalent to compare against, but it
	// is a second, distinct read of the deployment-zones domain, so it bills
	// like one.
	loaders.Register(DeploymentsByReleaseLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(
			loaders,
			dogfooding.DeploymentZoneReadEntitlementSlug,
			newDeploymentsByReleaseBatchFn(deploymentZoneLink),
		),
	))
}

func newComponentsByReleaseBatchFn(componentLink releaselink.Port) dataloaderLib.BatchFunc[uuid.UUID, []componentschema.Component] {
	return func(ctx context.Context, releaseIDs []uuid.UUID) []*dataloaderLib.Result[[]componentschema.Component] {
		results := make([]*dataloaderLib.Result[[]componentschema.Component], len(releaseIDs))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fillComponentsErrors(results, err)
		}

		// Initialize result map with empty slices for each release ID
		componentsByRelease := make(map[uuid.UUID][]componentschema.Component, len(releaseIDs))
		for _, id := range releaseIDs {
			componentsByRelease[id] = []componentschema.Component{}
		}

		// Fetch components for each release ID
		// Note: Could be optimized with a batch query if needed
		for _, releaseID := range releaseIDs {
			components, err := componentLink.GetComponentsByReleaseID(ctx, releaseID, organizationID)
			if err != nil {
				return fillComponentsErrors(results, err)
			}
			componentsByRelease[releaseID] = components
		}

		// Map results in order of keys
		for i, releaseID := range releaseIDs {
			results[i] = &dataloaderLib.Result[[]componentschema.Component]{Data: componentsByRelease[releaseID]}
		}

		return results
	}
}

func newDeploymentZonesByReleaseBatchFn(
	deploymentZoneLink deploymentzonereleaselink.Port,
) dataloaderLib.BatchFunc[uuid.UUID, []deploymentzoneschema.DeploymentZone] {
	return func(
		ctx context.Context,
		releaseIDs []uuid.UUID,
	) []*dataloaderLib.Result[[]deploymentzoneschema.DeploymentZone] {
		results := make(
			[]*dataloaderLib.Result[[]deploymentzoneschema.DeploymentZone],
			len(releaseIDs),
		)

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fillSliceErrors(results, err)
		}

		grouped, err := deploymentZoneLink.GetDeploymentZonesByReleaseIDs(ctx, releaseIDs, organizationID)
		if err != nil {
			return fillSliceErrors(results, err)
		}

		for i, releaseID := range releaseIDs {
			results[i] = &dataloaderLib.Result[[]deploymentzoneschema.DeploymentZone]{
				Data: grouped[releaseID],
			}
		}

		return results
	}
}

func newInstancesByReleaseBatchFn(
	instanceLink instancereleaselink.Port,
) dataloaderLib.BatchFunc[uuid.UUID, []instanceschema.Instance] {
	return func(
		ctx context.Context,
		releaseIDs []uuid.UUID,
	) []*dataloaderLib.Result[[]instanceschema.Instance] {
		results := make([]*dataloaderLib.Result[[]instanceschema.Instance], len(releaseIDs))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fillSliceErrors(results, err)
		}

		grouped, err := instanceLink.GetInstancesByReleaseIDs(ctx, releaseIDs, organizationID)
		if err != nil {
			return fillSliceErrors(results, err)
		}

		for i, releaseID := range releaseIDs {
			results[i] = &dataloaderLib.Result[[]instanceschema.Instance]{
				Data: grouped[releaseID],
			}
		}

		return results
	}
}

func newDeploymentsByReleaseBatchFn(
	deploymentZoneLink deploymentzonereleaselink.Port,
) dataloaderLib.BatchFunc[uuid.UUID, []deploymentzoneschema.Deployment] {
	return func(
		ctx context.Context,
		releaseIDs []uuid.UUID,
	) []*dataloaderLib.Result[[]deploymentzoneschema.Deployment] {
		results := make(
			[]*dataloaderLib.Result[[]deploymentzoneschema.Deployment],
			len(releaseIDs),
		)

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fillSliceErrors(results, err)
		}

		grouped, err := deploymentZoneLink.GetDeploymentsByReleaseIDs(ctx, releaseIDs, organizationID)
		if err != nil {
			return fillSliceErrors(results, err)
		}

		for i, releaseID := range releaseIDs {
			results[i] = &dataloaderLib.Result[[]deploymentzoneschema.Deployment]{
				Data: grouped[releaseID],
			}
		}

		return results
	}
}

func getOrganizationID(ctx context.Context) (uuid.UUID, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return uuid.UUID{}, dataloader.ErrMissingIdentity
	}
	return i.OrganizationID, nil
}

func fillComponentsErrors(results []*dataloaderLib.Result[[]componentschema.Component], err error) []*dataloaderLib.Result[[]componentschema.Component] {
	for i := range results {
		results[i] = &dataloaderLib.Result[[]componentschema.Component]{Error: err}
	}
	return results
}

func fillSliceErrors[T any](results []*dataloaderLib.Result[[]T], err error) []*dataloaderLib.Result[[]T] {
	for i := range results {
		results[i] = &dataloaderLib.Result[[]T]{Error: err}
	}
	return results
}

// LoadComponentsByRelease loads components for a release using the dataloader.
func LoadComponentsByRelease(ctx context.Context, releaseID uuid.UUID) ([]componentschema.Component, error) {
	loaders := dataloader.LoadersFromContext(ctx)
	loader, err := dataloader.GetLoader[uuid.UUID, []componentschema.Component](loaders, ComponentsByReleaseLoaderName)
	if err != nil {
		return nil, err
	}
	return loader.Load(ctx, releaseID)()
}

func LoadDeploymentZonesByRelease(
	ctx context.Context,
	releaseID uuid.UUID,
) ([]deploymentzoneschema.DeploymentZone, error) {
	loaders := dataloader.LoadersFromContext(ctx)
	loader, err := dataloader.GetLoader[uuid.UUID, []deploymentzoneschema.DeploymentZone](
		loaders,
		DeploymentZonesByReleaseLoaderName,
	)
	if err != nil {
		return nil, err
	}
	return loader.Load(ctx, releaseID)()
}

func LoadInstancesByRelease(
	ctx context.Context,
	releaseID uuid.UUID,
) ([]instanceschema.Instance, error) {
	loaders := dataloader.LoadersFromContext(ctx)
	loader, err := dataloader.GetLoader[uuid.UUID, []instanceschema.Instance](
		loaders,
		InstancesByReleaseLoaderName,
	)
	if err != nil {
		return nil, err
	}
	return loader.Load(ctx, releaseID)()
}

func LoadDeploymentsByRelease(
	ctx context.Context,
	releaseID uuid.UUID,
) ([]deploymentzoneschema.Deployment, error) {
	loaders := dataloader.LoadersFromContext(ctx)
	loader, err := dataloader.GetLoader[uuid.UUID, []deploymentzoneschema.Deployment](
		loaders,
		DeploymentsByReleaseLoaderName,
	)
	if err != nil {
		return nil, err
	}
	return loader.Load(ctx, releaseID)()
}
