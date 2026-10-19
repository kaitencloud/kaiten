package reportentitlementusagemetric

import (
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
)

// InstanceEntitlementUsageReportAccepted is the outbox payload for both
// ENTITLEMENT_USAGE_REPORT_ACCEPTED and ENTITLEMENT_USAGE_REPORT_REJECTED;
// Status says which. A rejected report is not persisted, so Value and
// Behavior describe what was asked for, not what was stored.
type InstanceEntitlementUsageReportAccepted struct {
	EntitlementSlug string                   `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement the usage was reported against"`
	Value           float64                  `json:"value" doc:"Value carried by the report"`
	Behavior        Behavior                 `json:"behavior" enum:"append,set" doc:"Report behavior: append folds the value into the stored total, set overwrites it"`
	EventCount      int32                    `json:"event_count" doc:"Number of reports folded into the current usage window, including this one"`
	Status          events.UsageReportStatus `json:"status" enum:"ACCEPTED,REJECTED" doc:"Whether the report was persisted"`
}

// InstanceEntitlementCapExceeded is the outbox payload for
// INSTANCE_ENTITLEMENT_CAP_EXCEEDED.
type InstanceEntitlementCapExceeded struct {
	EntitlementSlug string  `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement"`
	Threshold       float64 `json:"threshold" doc:"The entitlement cap"`
	Value           float64 `json:"value" doc:"Current usage value, including overage"`
	Overage         float64 `json:"overage" doc:"Amount by which usage exceeds the cap"`
}

// InstanceEntitlementUsageWarningThresholdReached is the outbox payload for
// INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED.
type InstanceEntitlementUsageWarningThresholdReached struct {
	EntitlementSlug string  `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement"`
	Threshold       float64 `json:"threshold" doc:"The entitlement cap"`
	Boundary        float64 `json:"boundary" doc:"Usage value at which the warning fires (cap * warningThresholdPercent / 100)"`
	Value           float64 `json:"value" doc:"Current usage value"`
}

// InstanceEntitlementUsagePeriodRolledOver is the outbox payload for
// INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER. One is emitted per
// usage.Closure -- see the events.InstanceEntitlementUsagePeriodRolledOver
// doc comment for what real vs. synthetic closures mean.
type InstanceEntitlementUsagePeriodRolledOver struct {
	EntitlementID     uuid.UUID  `json:"entitlement_id"`
	EntitlementSlug   string     `json:"entitlement_slug"`
	InstanceID        uuid.UUID  `json:"instance_id"`
	Value             float64    `json:"value"`
	EventCount        int32      `json:"event_count"`
	ClosedPeriodStart *time.Time `json:"closed_period_start"`
	ClosedPeriodEnd   *time.Time `json:"closed_period_end"`
	NewPeriodStart    time.Time  `json:"new_period_start"`
	IsSynthetic       bool       `json:"is_synthetic"`
}

type InstanceAIModelUsageUnauthorized struct {
	EntitlementSlug string `json:"entitlement_slug"`
	Model           string `json:"model"`
	RequestType     string `json:"requestType"`
	Reason          string `json:"reason"`
}
