package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/addentitlementtogroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/deleteentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/deleteentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroups"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroupusage"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/removeentitlementfromgroup"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/updateentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/updateentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Entitlements is the entitlements module's thirteen operations, over two aggregates:
// the entitlement itself, and the group that collects several of them so a license
// can grant them as one unit.
//
// The bare verbs belong to the entitlement -- Create, Get, List, Update, Delete --
// and everything about a group says Group, including the two that manage membership.
// AddToGroup and RemoveFromGroup are named for what they do to the entitlement rather
// than for the row they write, because a membership is not a thing a caller holds a
// reference to.
//
// GetGroupUsage takes an instance slug alongside the group: a group's usage is the
// aggregate of its members' usage *for one instance*, so there is no group usage
// without one. It arrives as a required query parameter over HTTP and as an ordinary
// argument here.
//
// See Customers for the naming and argument-order convention.
type Entitlements struct {
	uc *entitlements.UseCases
}

// Entitlements returns the entitlements surface.
func (k *Kaiten) Entitlements() Entitlements {
	return Entitlements{uc: k.modules.Entitlements}
}

func (e Entitlements) Create(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createentitlement.Command,
) (*entitlementschema.Entitlement, error) {
	if err := cl.Require(createentitlement.RequiredScope); err != nil {
		return nil, err
	}

	return e.uc.CreateEntitlement.Execute(bindOrganization(ctx, cl), cmd)
}

func (e Entitlements) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*entitlementschema.Entitlement], error) {
	if err := cl.Require(getentitlements.RequiredScope); err != nil {
		return pagination.Page[*entitlementschema.Entitlement]{}, err
	}

	return e.uc.GetEntitlements.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (e Entitlements) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*entitlementschema.Entitlement, error) {
	if err := cl.Require(getentitlement.RequiredScope); err != nil {
		return nil, err
	}

	return e.uc.GetEntitlement.Execute(bindOrganization(ctx, cl), slug)
}

func (e Entitlements) Update(
	ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *updateentitlement.Command,
) error {
	if err := cl.Require(updateentitlement.RequiredScope); err != nil {
		return err
	}

	return e.uc.UpdateEntitlement.Execute(bindOrganization(ctx, cl), cmd, slug)
}

func (e Entitlements) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deleteentitlement.RequiredScope); err != nil {
		return err
	}

	return e.uc.DeleteEntitlement.Execute(bindOrganization(ctx, cl), slug)
}

func (e Entitlements) CreateGroup(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createentitlementgroup.Command,
) (*entitlementschema.EntitlementGroup, error) {
	if err := cl.Require(createentitlementgroup.RequiredScope); err != nil {
		return nil, err
	}

	return e.uc.CreateEntitlementGroup.Execute(bindOrganization(ctx, cl), cmd)
}

func (e Entitlements) ListGroups(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*entitlementschema.EntitlementGroup], error) {
	if err := cl.Require(getentitlementgroups.RequiredScope); err != nil {
		return pagination.Page[*entitlementschema.EntitlementGroup]{}, err
	}

	return e.uc.GetEntitlementGroups.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (e Entitlements) GetGroup(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*entitlementschema.EntitlementGroup, error) {
	if err := cl.Require(getentitlementgroup.RequiredScope); err != nil {
		return nil, err
	}

	return e.uc.GetEntitlementGroup.Execute(bindOrganization(ctx, cl), slug)
}

func (e Entitlements) UpdateGroup(
	ctx context.Context, cl caller.OrganizationCaller,
	slug string, cmd *updateentitlementgroup.Command,
) error {
	if err := cl.Require(updateentitlementgroup.RequiredScope); err != nil {
		return err
	}

	return e.uc.UpdateEntitlementGroup.Execute(bindOrganization(ctx, cl), cmd, slug)
}

func (e Entitlements) DeleteGroup(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) error {
	if err := cl.Require(deleteentitlementgroup.RequiredScope); err != nil {
		return err
	}

	return e.uc.DeleteEntitlementGroup.Execute(bindOrganization(ctx, cl), slug)
}

func (e Entitlements) AddToGroup(
	ctx context.Context, cl caller.OrganizationCaller,
	groupSlug string, cmd *addentitlementtogroup.Command,
) error {
	if err := cl.Require(addentitlementtogroup.RequiredScope); err != nil {
		return err
	}

	return e.uc.AddEntitlementToGroup.Execute(bindOrganization(ctx, cl), groupSlug, cmd)
}

func (e Entitlements) RemoveFromGroup(
	ctx context.Context, cl caller.OrganizationCaller, groupSlug, entitlementSlug string,
) error {
	if err := cl.Require(removeentitlementfromgroup.RequiredScope); err != nil {
		return err
	}

	return e.uc.RemoveEntitlementFromGroup.Execute(
		bindOrganization(ctx, cl), groupSlug, entitlementSlug)
}

func (e Entitlements) GetGroupUsage(
	ctx context.Context, cl caller.OrganizationCaller, groupSlug, instanceSlug string,
) ([]*entitlementschema.EntitlementGroupUsage, error) {
	if err := cl.Require(getentitlementgroupusage.RequiredScope); err != nil {
		return nil, err
	}

	return e.uc.GetEntitlementGroupUsage.Execute(
		bindOrganization(ctx, cl), groupSlug, instanceSlug)
}
