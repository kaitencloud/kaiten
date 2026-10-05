package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/deleteinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/deleteintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/exportorganizationusagereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/exportusagereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getaudittrails"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementsusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstances"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/listusagereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/patchinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Instances is the instances module's seventeen operations -- the largest namespace
// here, because an instance is what everything else in the domain ends up attached
// to: a customer's deployment, a license's grants, a deployment zone's release, and
// the usage that meters all three.
//
// Four groups, and the method names say which one a call belongs to. The instance
// itself gets the bare verbs; a record hanging off it keeps its noun, the way
// Customers does -- CreateIntegration, GetEntitlementUsage, ListAuditTrails.
//
// Patch is separate from Update rather than folded into it. They are two operations
// with two scopes and two event sets: Update replaces the instance and can emit a
// migration, Patch touches the operational status or the lifecycle stage and emits
// one change event per field it actually changed. Collapsing them would put that
// difference behind a nil check.
//
// See Customers for the naming and argument-order convention.
type Instances struct {
	uc *instances.UseCases
}

// Instances returns the instances surface.
func (k *Kaiten) Instances() Instances {
	return Instances{uc: k.modules.Instances}
}

func (i Instances) Create(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createinstance.Command,
) (*instanceschema.Instance, error) {
	if err := cl.Require(createinstance.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.CreateInstance.Execute(bindOrganization(ctx, cl), cmd)
}

func (i Instances) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*instanceschema.Instance], error) {
	if err := cl.Require(getinstances.RequiredScope); err != nil {
		return pagination.Page[*instanceschema.Instance]{}, err
	}

	return i.uc.GetInstances.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (i Instances) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*instanceschema.Instance, error) {
	if err := cl.Require(getinstance.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.GetInstance.Execute(bindOrganization(ctx, cl), slug)
}

func (i Instances) Update(
	ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *updateinstance.Command,
) (*instanceschema.Instance, error) {
	if err := cl.Require(updateinstance.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.UpdateInstance.Execute(bindOrganization(ctx, cl), cmd, slug)
}

// Patch applies a partial update. Absence is the only "leave alone" signal its
// command has, which is the command's contract rather than the facade's: a nil field
// is not a request to clear the value.
func (i Instances) Patch(
	ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *patchinstance.Command,
) error {
	if err := cl.Require(patchinstance.RequiredScope); err != nil {
		return err
	}

	return i.uc.PatchInstance.Execute(bindOrganization(ctx, cl), cmd, slug)
}

func (i Instances) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deleteinstance.RequiredScope); err != nil {
		return err
	}

	return i.uc.DeleteInstance.Execute(bindOrganization(ctx, cl), slug)
}

func (i Instances) CreateIntegration(
	ctx context.Context, cl caller.OrganizationCaller,
	instanceSlug, integrationName string, body instanceschema.InstanceIntegration,
) (*instanceschema.InstanceIntegration, error) {
	if err := cl.Require(createintegrations.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.CreateIntegration.Execute(bindOrganization(ctx, cl), instanceSlug, integrationName, body)
}

func (i Instances) GetIntegration(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug, integrationName string,
) (*instanceschema.InstanceIntegration, error) {
	if err := cl.Require(getintegrations.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.GetIntegration.Execute(bindOrganization(ctx, cl), instanceSlug, integrationName)
}

func (i Instances) UpdateIntegration(
	ctx context.Context, cl caller.OrganizationCaller,
	instanceSlug, integrationName string, body instanceschema.InstanceIntegration,
) (*instanceschema.InstanceIntegration, error) {
	if err := cl.Require(updateintegrations.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.UpdateIntegration.Execute(bindOrganization(ctx, cl), instanceSlug, integrationName, body)
}

func (i Instances) DeleteIntegration(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug, integrationName string,
) error {
	if err := cl.Require(deleteintegrations.RequiredScope); err != nil {
		return err
	}

	return i.uc.DeleteIntegration.Execute(bindOrganization(ctx, cl), instanceSlug, integrationName)
}

// ReportEntitlementUsage folds a reported value into an instance's usage for one
// entitlement. It is the one write here that can be refused by the domain rather
// than by authorization -- a HARD-enforcement cap rejects the report and persists
// nothing -- and the facade passes that through untouched.
func (i Instances) ReportEntitlementUsage(
	ctx context.Context, cl caller.OrganizationCaller,
	instanceSlug, entitlementSlug string, cmd *reportentitlementusagemetric.Command,
) (*reportentitlementusagemetric.Result, error) {
	if err := cl.Require(reportentitlementusagemetric.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.ReportEntitlementUsageMetric.Execute(
		bindOrganization(ctx, cl), instanceSlug, entitlementSlug, cmd)
}

// GetEntitlementUsage reads one entitlement's usage. It emits a read-audit event,
// so it is a read that writes -- worth knowing before calling it in a loop.
func (i Instances) GetEntitlementUsage(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug string,
) (*instanceschema.EntitlementUsage, error) {
	if err := cl.Require(getentitlementusagemetrics.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.GetEntitlementUsageMetrics.Execute(
		bindOrganization(ctx, cl), instanceSlug, entitlementSlug)
}

// ListEntitlementUsage reads every entitlement's usage for one instance,
// unpaginated: the list is bounded by the instance's license grants, not by how much
// usage has been reported against them.
func (i Instances) ListEntitlementUsage(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string,
) ([]instanceschema.EntitlementUsage, error) {
	if err := cl.Require(getentitlementsusagemetrics.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.GetEntitlementsUsageMetrics.Execute(bindOrganization(ctx, cl), instanceSlug)
}

// ListAuditTrails reads an instance's audit trail, filtered and paginated.
//
// The filters stay positional -- eventName, after, before -- rather than moving into
// a struct the facade would own. The use case takes them this way and it is the only
// caller-facing shape there is; inventing a second one here would be a parallel input
// type for one operation, which is exactly the duplication the facade avoids by
// passing commands through everywhere else.
func (i Instances) ListAuditTrails(
	ctx context.Context, cl caller.OrganizationCaller,
	instanceSlug string, eventName, after, before *string, limit int32, cursor *string,
) (pagination.Page[*instanceschema.AuditTrail], error) {
	if err := cl.Require(getaudittrails.RequiredScope); err != nil {
		return pagination.Page[*instanceschema.AuditTrail]{}, err
	}

	return i.uc.GetAuditTrails.Execute(
		bindOrganization(ctx, cl), instanceSlug, eventName, after, before, limit, cursor)
}

// ListUsageReports reads one page of a pair's usage history: the reports the
// journal recorded, within the organization's retention. A read only: unlike
// GetEntitlementUsage it emits no event.
func (i Instances) ListUsageReports(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug string, q listusagereports.Query,
) (*listusagereports.UsageReportPage, error) {
	if err := cl.Require(listusagereports.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.ListUsageReports.Execute(bindOrganization(ctx, cl), instanceSlug, entitlementSlug, q)
}

// ExportUsageReports checks an export of a pair's usage history and returns it
// ready to stream; the rows are read as it is written.
func (i Instances) ExportUsageReports(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug string, q exportusagereports.Query,
) (*usagehistory.Export, error) {
	if err := cl.Require(exportusagereports.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.ExportUsageReports.Execute(bindOrganization(ctx, cl), instanceSlug, entitlementSlug, q)
}

// ExportOrganizationUsageReports is ExportUsageReports across the whole
// organization, deleted instances and entitlements included.
func (i Instances) ExportOrganizationUsageReports(
	ctx context.Context, cl caller.OrganizationCaller, q exportorganizationusagereports.Query,
) (*usagehistory.Export, error) {
	if err := cl.Require(exportorganizationusagereports.RequiredScope); err != nil {
		return nil, err
	}

	return i.uc.ExportOrganizationUsageReports.Execute(bindOrganization(ctx, cl), q)
}

// EnsureUsageLedger creates the usage journal's missing monthly partitions and
// fails if reports dated now would have none to land in. It is a readiness
// check, not an operation: no caller, no scope. Nil-safe without a pool.
func (k *Kaiten) EnsureUsageLedger(ctx context.Context) error {
	if k.modules.Instances.UsageLedger == nil {
		return nil
	}
	return k.modules.Instances.UsageLedger.EnsureReady(ctx)
}
