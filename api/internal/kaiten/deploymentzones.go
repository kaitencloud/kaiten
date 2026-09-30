package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/deletedeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzones"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/updatedeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// DeploymentZones is the deployment zones module's five operations.
//
// Update returns nothing, which is the use case's shape rather than a facade
// decision: a zone update can record a deployment, and the response the transport
// publishes is 204 with no body. The facade does not invent a return value the
// operation does not produce.
//
// The module's createdeployment service has no method here and never will: it runs
// inside the create and update transactions, so it has no caller of its own to
// authorize. It is reached by acting on a zone, which is what these methods do.
//
// See Customers for the naming and argument-order convention.
type DeploymentZones struct {
	uc *deploymentzones.UseCases
}

// DeploymentZones returns the deployment zones surface.
func (k *Kaiten) DeploymentZones() DeploymentZones {
	return DeploymentZones{uc: k.modules.DeploymentZones}
}

func (d DeploymentZones) Create(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createdeploymentzone.Command,
) (*deploymentzoneschema.DeploymentZone, error) {
	if err := cl.Require(createdeploymentzone.RequiredScope); err != nil {
		return nil, err
	}

	return d.uc.CreateDeploymentZone.Execute(bindOrganization(ctx, cl), cmd)
}

func (d DeploymentZones) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*deploymentzoneschema.DeploymentZone], error) {
	if err := cl.Require(getdeploymentzones.RequiredScope); err != nil {
		return pagination.Page[*deploymentzoneschema.DeploymentZone]{}, err
	}

	return d.uc.GetDeploymentZones.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (d DeploymentZones) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*deploymentzoneschema.DeploymentZone, error) {
	if err := cl.Require(getdeploymentzone.RequiredScope); err != nil {
		return nil, err
	}

	return d.uc.GetDeploymentZone.Execute(bindOrganization(ctx, cl), slug)
}

func (d DeploymentZones) Update(
	ctx context.Context, cl caller.OrganizationCaller,
	slug string, cmd *updatedeploymentzone.Command,
) error {
	if err := cl.Require(updatedeploymentzone.RequiredScope); err != nil {
		return err
	}

	return d.uc.UpdateDeploymentZone.Execute(bindOrganization(ctx, cl), cmd, slug)
}

func (d DeploymentZones) Delete(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) error {
	if err := cl.Require(deletedeploymentzone.RequiredScope); err != nil {
		return err
	}

	return d.uc.DeleteDeploymentZone.Execute(bindOrganization(ctx, cl), slug)
}
