package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

type UsageReportStatus string

const (
	UsageReportStatusAccepted UsageReportStatus = "ACCEPTED"
	UsageReportStatusRejected UsageReportStatus = "REJECTED"
)

var (
	InstanceCreated                 = events.New("INSTANCE_CREATED", "com.kaiten.instance.v1.created")
	InstanceUpdated                 = events.New("INSTANCE_UPDATED", "com.kaiten.instance.v1.updated")
	InstanceStatusChanged           = events.New("INSTANCE_STATUS_CHANGED", "com.kaiten.instance.v1.status_changed")
	InstanceLifecycleStageChanged   = events.New("INSTANCE_LIFECYCLE_STAGE_CHANGED", "com.kaiten.instance.v1.lifecycle_stage_changed")
	InstanceDeleted                 = events.New("INSTANCE_DELETED", "com.kaiten.instance.v1.deleted")
	InstanceDeployed                = events.New("INSTANCE_DEPLOYED", "com.kaiten.instance.v1.deployed")
	InstanceMigrated                = events.New("INSTANCE_MIGRATED", "com.kaiten.instance.v1.migrated")
	InstanceEntitlementUsageReached = events.New("INSTANCE_ENTITLEMENT_USAGE_REACHED", "com.kaiten.instance.entitlement.v1.usage_reached")

	// InstanceEntitlementCapExceeded fires when a SOFT-enforcement entitlement's
	// usage crosses from below the cap to above it (the report is still accepted
	// and persisted, including the overage). It fires once per crossing, not on
	// every subsequent report while usage remains above the cap.
	InstanceEntitlementCapExceeded = events.New("INSTANCE_ENTITLEMENT_CAP_EXCEEDED", "com.kaiten.instance.entitlement.v1.cap_exceeded")

	// InstanceEntitlementUsageWarningThresholdReached fires when usage crosses
	// the entitlement's configured early-warning percentage boundary (below the
	// cap). It fires once per crossing, not on every subsequent report while
	// usage remains at or above the boundary.
	InstanceEntitlementUsageWarningThresholdReached = events.New("INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED", "com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached")
	EntitlementUsageReportAccepted                  = events.New("ENTITLEMENT_USAGE_REPORT_ACCEPTED", "com.kaiten.instance.entitlement.v1.usage_report_accepted")
	EntitlementUsageReportRejected                  = events.New("ENTITLEMENT_USAGE_REPORT_REJECTED", "com.kaiten.instance.entitlement.v1.usage_report_rejected")
	EntitlementValueGet                             = events.New("ENTITLEMENT_VALUE_GET", "com.kaiten.instance.entitlement.v1.value_get")

	// InstanceEntitlementUsagePeriodRolledOver fires whenever the report path
	// closes a periodic usage window: either the entitlement's real
	// stored bucket (IsSynthetic=false in the payload), or -- when a report
	// arrives after multiple windows were skipped entirely -- one of the
	// empty intermediate windows materialized to keep the audit trail gapless
	// (IsSynthetic=true). This is the only historical representation of a
	// closed bucket in v1; there is no separate usage-history table.
	InstanceEntitlementUsagePeriodRolledOver = events.New("INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER", "com.kaiten.instance.entitlement.v1.usage_period_rolled_over")
)
