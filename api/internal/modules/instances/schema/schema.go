package schema

import (
	"encoding/json"
	"fmt"
	"reflect"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// NumberEntitlementValue represents a numeric entitlement value.
//
// EventCount keeps its readOnly marker, unlike the response DTOs that dropped
// theirs once the write endpoints got their own *Body types: this union is
// genuinely both a request and a response shape -- it is the value a client
// reports usage with and the value the server reads back -- and event_count is
// the one member only the server ever fills in. It is optional, so it carries
// none of the required-plus-readOnly contradiction that made readOnly a
// problem elsewhere.
type NumberEntitlementValue struct {
	Type       string  `json:"type" doc:"Value type discriminator" enum:"number" example:"number"`
	Value      float64 `json:"value" doc:"Numeric value" example:"42.5"`
	EventCount int32   `json:"event_count,omitempty" doc:"Number of events accumulated (server-computed)" readOnly:"true" example:"2"`
}

// BooleanEntitlementValue represents a boolean entitlement value.
type BooleanEntitlementValue struct {
	Type  string `json:"type" doc:"Value type discriminator" enum:"boolean" example:"boolean"`
	Value bool   `json:"value" doc:"Boolean value" example:"true"`
}

// ConfigEntitlementValue represents a configuration (object) entitlement value.
type ConfigEntitlementValue struct {
	Type  string         `json:"type" doc:"Value type discriminator" enum:"object" example:"object"`
	Value map[string]any `json:"value" doc:"Object configuration value"`
}

// EntitlementValue is a discriminated union of typed entitlement values.
// Use the "type" field as the discriminator.
type EntitlementValue struct {
	Number  *NumberEntitlementValue
	Boolean *BooleanEntitlementValue
	Config  *ConfigEntitlementValue
}

// Schema implements huma.SchemaProvider and generates a oneOf schema referencing the typed variants.
func (v EntitlementValue) Schema(r huma.Registry) *huma.Schema {
	r.Schema(reflect.TypeOf(NumberEntitlementValue{}), true, "NumberEntitlementValue")
	r.Schema(reflect.TypeOf(BooleanEntitlementValue{}), true, "BooleanEntitlementValue")
	r.Schema(reflect.TypeOf(ConfigEntitlementValue{}), true, "ConfigEntitlementValue")
	return &huma.Schema{
		OneOf: []*huma.Schema{
			{Ref: "#/components/schemas/NumberEntitlementValue"},
			{Ref: "#/components/schemas/BooleanEntitlementValue"},
			{Ref: "#/components/schemas/ConfigEntitlementValue"},
		},
		Discriminator: &huma.Discriminator{
			PropertyName: "type",
			Mapping: map[string]string{
				"number":  "#/components/schemas/NumberEntitlementValue",
				"boolean": "#/components/schemas/BooleanEntitlementValue",
				"object":  "#/components/schemas/ConfigEntitlementValue",
			},
		},
	}
}

// MarshalJSON serializes the active variant.
func (v EntitlementValue) MarshalJSON() ([]byte, error) {
	if v.Number != nil {
		return json.Marshal(v.Number)
	}
	if v.Boolean != nil {
		return json.Marshal(v.Boolean)
	}
	if v.Config != nil {
		return json.Marshal(v.Config)
	}
	return []byte("null"), nil
}

// UnmarshalJSON deserializes the correct variant based on the "type" discriminator.
func (v *EntitlementValue) UnmarshalJSON(data []byte) error {
	var discriminator struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &discriminator); err != nil {
		return err
	}
	switch discriminator.Type {
	case "number":
		var nv NumberEntitlementValue
		if err := json.Unmarshal(data, &nv); err != nil {
			return err
		}
		v.Number = &nv
	case "boolean":
		var bv BooleanEntitlementValue
		if err := json.Unmarshal(data, &bv); err != nil {
			return err
		}
		v.Boolean = &bv
	case "object":
		var cv ConfigEntitlementValue
		if err := json.Unmarshal(data, &cv); err != nil {
			return err
		}
		v.Config = &cv
	default:
		return fmt.Errorf("unknown entitlement value type: %q", discriminator.Type)
	}
	return nil
}

// ParseEntitlementValue decodes a stored entitlement value -- a usage row or a
// license grant -- into the wire union. Both are LEFT JOINed by the usage
// queries, so an absent value decodes to nil rather than an error.
func ParseEntitlementValue(raw []byte) (*EntitlementValue, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	var value EntitlementValue
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}

	return &value, nil
}

// TypeString returns the discriminator string for the active variant.
func (v EntitlementValue) TypeString() string {
	if v.Number != nil {
		return "number"
	}
	if v.Boolean != nil {
		return "boolean"
	}
	if v.Config != nil {
		return "object"
	}
	return ""
}

type EntitlementUsage struct {
	EntitlementID   uuid.UUID        `json:"entitlementId" doc:"Unique identifier for the entitlement" example:"123e4567-e89b-12d3-a456-426614174000"`
	EntitlementSlug string           `json:"entitlementSlug" doc:"URL-friendly identifier of the entitlement" example:"premium-support"`
	LicenseID       uuid.UUID        `json:"licenseId" doc:"Unique identifier for the license to which this entitlement usage belongs" example:"123e4567-e89b-12d3-a456-426614174001"`
	LicenseSlug     string           `json:"licenseSlug" doc:"URL-friendly identifier of the license" example:"enterprise-license"`
	Value           EntitlementValue `json:"value" doc:"Resolved entitlement value, discriminated by the 'type' field"`
	// Limit is the license grant this usage is measured against, so a caller can
	// render "7 / 10" from this response alone instead of also fetching the
	// license entitlement. Null when the license grants no value; for a NUMBER
	// entitlement a value of -1 means unlimited. BOOLEAN and CONFIG
	// entitlements have no usage of their own, so Value repeats it.
	Limit *EntitlementValue `json:"limit,omitempty" doc:"License grant this usage is measured against, discriminated by the 'type' field. Null when the license grants no value; -1 means unlimited for a NUMBER entitlement."`
	// CurrentPeriodStart/End are null for a lifetime entitlement (no configured
	// reset period). For a periodic entitlement, these are the bounds of the
	// window containing "now" at read time, computed lazily -- whether or not
	// the stored row still belongs to it. The one exception is a stored window
	// that is ahead of "now" (see period.ResolveCurrent): that window is the
	// current one, for reads as for reports.
	CurrentPeriodStart *time.Time `json:"currentPeriodStart,omitempty" doc:"Start of the current usage window (inclusive). Null for a lifetime entitlement (no configured reset period)." example:"2026-03-01T00:00:00Z"`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd,omitempty" doc:"End of the current usage window (exclusive). Null for a lifetime entitlement (no configured reset period)." example:"2026-04-01T00:00:00Z"`
}

type AuditTrail struct {
	ID           uuid.UUID  `json:"id" doc:"Unique audit trail entry ID"`
	InstanceID   *uuid.UUID `json:"instanceId,omitempty" doc:"Instance UUID (present for instance-scoped events)"`
	InstanceSlug string     `json:"instanceSlug" doc:"Instance slug"`
	EventName    string     `json:"eventName" doc:"Event name (e.g. ENTITLEMENT_VALUE_GET)"`
	EventType    string     `json:"eventType" doc:"Event type identifier (e.g. com.kaiten.instance.entitlement.v1.value_get)"`
	Timestamp    time.Time  `json:"timestamp" doc:"When the event occurred"`
	Payload      any        `json:"payload,omitempty" doc:"Event payload (JSON)"`
}

// AuditTrailPage is a cursor-paginated page of instance-scoped audit trail
// entries, returned by the GraphQL auditTrails field (on both Instance and
// Query) -- the GraphQL counterpart of the REST getaudittrails endpoint's
// pagination.Page[*AuditTrail] envelope. It is a plain (non-generic)
// struct, rather than pagination.Page itself, because gqlgen's model
// binding (see gqlgen.yml) needs a concrete Go type to bind the
// AuditTrailPage GraphQL type to.
type AuditTrailPage struct {
	Items      []AuditTrail
	NextCursor *string
	HasMore    bool
}

// OrganizationAuditTrailPage is the organization-wide counterpart of
// AuditTrailPage, returned by the GraphQL organizationAuditTrails field.
type OrganizationAuditTrailPage struct {
	Items      []OrganizationAuditTrail
	NextCursor *string
	HasMore    bool
}

// OrganizationAuditTrail is an organization-wide audit trail entry. Instance
// and customer fields are only set for instance-scoped events.
type OrganizationAuditTrail struct {
	ID           uuid.UUID
	InstanceID   *uuid.UUID
	InstanceSlug *string
	InstanceName *string
	CustomerID   *uuid.UUID
	CustomerSlug *string
	CustomerName *string
	EventName    string
	EventType    string
	Timestamp    time.Time
	Payload      map[string]any
}

type InstanceStatus string

const (
	InstanceStatusHealthy     InstanceStatus = "HEALTHY"
	InstanceStatusDegraded    InstanceStatus = "DEGRADED"
	InstanceStatusIncident    InstanceStatus = "INCIDENT"
	InstanceStatusMaintenance InstanceStatus = "MAINTENANCE"
)

// InstanceIntegration is reused unmodified as the request body for both
// create-instance-integration and update-instance-integration, as well as
// the response for both and the value type of Instance.Integrations.
// SyncedAt is readOnly:"true" because it is set by the sync process, never
// by a write to this endpoint.
type InstanceIntegration struct {
	ExternalID string `json:"external_id" doc:"External identifier in the third-party adapter" example:"rec_12345"`
	// Metadata is required:"false" rather than omitempty -- see Instance.Metadata.
	Metadata  map[string]any `json:"metadata" required:"false" doc:"Adapter-specific integration metadata"`
	WebURL    *string        `json:"web_url,omitempty" doc:"Absolute http(s) link to the record in the third-party system" example:"https://app.attio.com/w/acme/workspace/rec_12345"`
	SyncedAt  time.Time      `json:"synced_at" readOnly:"true" doc:"Timestamp of the last synchronization with the adapter"`
	LastError *string        `json:"last_error,omitempty" doc:"Last synchronization error message, if any"`
}

// Instance is reused unmodified as the request body for create-instance and
// update-instance, as well as the response for both and get-instance.
// ID/CreatedBy/CreatedAt/UpdatedBy/UpdatedAt are server-assigned;
// CustomerSlug/LicenseSlug/DeploymentZoneSlug are derived from the
// corresponding *ID field, never accepted on input; Status/LifecycleStage
// are set exclusively via PATCH (see patchinstance). All are readOnly:"true":
// a write never supplies them.
// Integrations is accepted on create but not settable through update-instance
// (it has its own dedicated endpoints); update-instance's handler rejects it
// being present with a 422 rather than silently ignoring it.
type Instance struct {
	ID                 uuid.UUID      `json:"id" readOnly:"true" doc:"Unique identifier for the instance" example:"123e4567-e89b-12d3-a2456-426614174000"`
	Slug               string         `json:"slug,omitempty" example:"my-instance" doc:"Optional URL-friendly identifier, unique per organization. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	CreatedBy          shared.User    `json:"createdBy" readOnly:"true" doc:"User who created this instance"`
	CreatedAt          time.Time      `json:"createdAt" readOnly:"true" doc:"Timestamp when the instance was created" example:"2023-10-01T12:00:00Z"`
	UpdatedBy          shared.User    `json:"updatedBy" readOnly:"true" doc:"User who last updated this instance"`
	UpdatedAt          time.Time      `json:"updatedAt" readOnly:"true" doc:"Timestamp when the instance was last updated" example:"2023-10-01T12:00:00Z"`
	Status             InstanceStatus `json:"status,omitempty" readOnly:"true" doc:"Operational status of the instance" enum:"HEALTHY,DEGRADED,INCIDENT,MAINTENANCE" example:"HEALTHY"`
	LifecycleStage     *string        `json:"lifecycleStage,omitempty" readOnly:"true" doc:"Commercial lifecycle stage of the instance (free-form; suggested: TRIAL, ACTIVE, AT_RISK, CHURNED)" example:"ACTIVE"`
	Name               string         `json:"name" doc:"Name of the instance" example:"My Instance" minLength:"1"`
	Description        string         `json:"description" doc:"Brief description of the instance" example:"This is a sample instance description"`
	CustomerID         uuid.UUID      `json:"customerId" doc:"ID of the customer associated with this instance" example:"123e4567-e89b-12d3-a456-426614174003"`
	CustomerSlug       string         `json:"customerSlug" readOnly:"true" doc:"Slug of the customer associated with this instance" example:"acme-corp"`
	LicenseID          uuid.UUID      `json:"licenseId" doc:"ID of the license version this instance is pinned to. An ARCHIVED version cannot be assigned, on create or by changing the license (CreateInstance.LicenseArchived, UpdateInstance.LicenseArchived); an instance already on a version that is archived later keeps it. A DRAFT version can be assigned, to try it before publishing." example:"123e4567-e89b-12d3-a456-426614174004"`
	LicenseSlug        string         `json:"licenseSlug" readOnly:"true" doc:"Slug of the license associated with this instance" example:"my-license"`
	DeploymentZoneID   *uuid.UUID     `json:"deploymentZoneId,omitempty" doc:"ID of the deployment zone associated with this instance (optional)" example:"123e4567-e89b-12d3-a456-426614174005"`
	DeploymentZoneSlug *string        `json:"deploymentZoneSlug,omitempty" readOnly:"true" doc:"Slug of the deployment zone associated with this instance (optional)" example:"aws-us-west-2"`
	StartLicenseDate   time.Time      `json:"startLicenseDate" doc:"Start date of the license for this instance" example:"2023-10-01T12:00:00Z"`
	EndLicenseDate     time.Time      `json:"endLicenseDate" doc:"End date of the license for this instance" example:"2024-10-01T12:00:00Z"`
	// Metadata is required:"false" rather than omitempty: the repository
	// hydrates a created instance's metadata as a non-nil empty map when
	// none is given, and omitempty would drop that empty map from the
	// response entirely, decoding back as nil on the read side -- a
	// mismatch TestGetInstances caught by comparing an instance fetched
	// over HTTP against the one createinstance's repository handed back
	// in-process. required:"false" keeps it optional on write without
	// touching how a present value -- {} included -- serializes on read.
	Metadata     map[string]any                 `json:"metadata" required:"false" doc:"Metadata for the instance" example:"{\"key\": \"value\"}"`
	Integrations map[string]InstanceIntegration `json:"integrations,omitempty" doc:"Integrations grouped by adapter name"`
}

// InstancePage is a cursor-paginated page of instances, returned by the
// GraphQL instances field -- the GraphQL counterpart of the REST
// getinstances endpoint's pagination.Page[*Instance] envelope. It is a
// plain (non-generic) struct, rather than pagination.Page itself, because
// gqlgen's model binding (see gqlgen.yml) needs a concrete Go type to bind
// the InstancePage GraphQL type to.
type InstancePage struct {
	Items      []Instance
	NextCursor *string
	HasMore    bool
}
