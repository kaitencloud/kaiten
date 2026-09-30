package schema

import (
	"time"

	"github.com/google/uuid"

	instancesschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

// EntitlementGroup is reused unmodified as the request body for both
// create-entitlement-group and update-entitlement-group, as well as the
// response for both and get-entitlement-group. ID is readOnly:"true"
// (server-assigned). Slug is accepted on create but not settable through
// update-entitlement-group -- its handler rejects it being present and
// different from the current slug with a 422.
type EntitlementGroup struct {
	ID          uuid.UUID `json:"id" readOnly:"true" doc:"Unique identifier for the entitlement group" example:"123e4567-e89b-12d3-a456-426614174000"`
	Name        string    `json:"name" doc:"Name of the entitlement group" example:"AI Quotas" minLength:"1"`
	Slug        string    `json:"slug,omitempty" example:"ai-quotas" doc:"URL-friendly identifier, unique per organization. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Description *string   `json:"description" doc:"Description of the entitlement group" example:"All entitlements related to AI usage quotas"`
}

// EntitlementGroupSummary represents the group metadata embedded in an entitlement payload.
type EntitlementGroupSummary struct {
	ID   uuid.UUID `json:"id" doc:"Unique identifier for the entitlement group" example:"123e4567-e89b-12d3-a456-426614174000"`
	Name string    `json:"name" doc:"Name of the entitlement group" example:"AI Quotas"`
	Slug string    `json:"slug" example:"ai-quotas" doc:"URL-friendly identifier for the entitlement group"`
}

// EntitlementGroupUsage represents the usage of a single entitlement within a group for a given instance.
type EntitlementGroupUsage struct {
	EntitlementID   uuid.UUID `json:"entitlementId" doc:"Entitlement ID"`
	EntitlementSlug string    `json:"entitlementSlug" doc:"Entitlement slug"`
	EntitlementName string    `json:"entitlementName" doc:"Entitlement name"`
	EntitlementType string    `json:"entitlementType" doc:"Entitlement type"`
	// UsageValue/LicenseValue carry the same typed union as the instance usage
	// DTO (instances/schema.EntitlementUsage.Value), not the raw stored bytes:
	// []byte marshals to base64, which is not the object the contract promises.
	// Both are LEFT JOINed by the query, so either can be null.
	UsageValue   *instancesschema.EntitlementValue `json:"usageValue,omitempty" doc:"Current usage value, discriminated by the 'type' field. Null when nothing has been reported yet."`
	LicenseValue *instancesschema.EntitlementValue `json:"licenseValue,omitempty" doc:"License limit value, discriminated by the 'type' field. Null when the license grants no value."`
	// CurrentPeriodStart/End are null for a lifetime entitlement (no configured
	// reset period). See Entitlement.ResetPeriod.
	CurrentPeriodStart *time.Time `json:"currentPeriodStart,omitempty" doc:"Start of the current usage window (inclusive). Null for a lifetime entitlement."`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd,omitempty" doc:"End of the current usage window (exclusive). Null for a lifetime entitlement."`
}
