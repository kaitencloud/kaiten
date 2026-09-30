package schema

import (
	"time"

	"github.com/google/uuid"

	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// CustomerCreationRejected is emitted when a customer creation attempt is blocked
// because the organization has reached its customer limit.
type CustomerCreationRejected struct {
	Name   string `json:"name"`
	Slug   string `json:"slug"`
	Reason string `json:"reason"`
}

// CustomerIntegration is reused unmodified as the request body for both
// create-customer-integration and update-customer-integration, as well as
// the response for both and the value type of Customer.Integrations.
// SyncedAt is readOnly:"true" because it is set by the sync process, never
// by a write to this endpoint.
type CustomerIntegration struct {
	ExternalID string `json:"external_id" doc:"External identifier in the third-party adapter" example:"rec_12345"`
	// Metadata is required:"false" rather than omitempty: an omitempty map
	// drops an empty-but-present value from the response, which decodes back
	// as nil rather than {} -- a mismatch when compared against a value
	// hydrated in-process instead of over the wire (see the identical
	// instances/schema.Instance.Metadata, caught by TestGetInstances).
	Metadata  map[string]any `json:"metadata" required:"false" doc:"Adapter-specific integration metadata"`
	WebURL    *string        `json:"web_url,omitempty" doc:"Absolute http(s) link to the record in the third-party system" example:"https://app.attio.com/w/acme/company/rec_12345"`
	SyncedAt  time.Time      `json:"synced_at" readOnly:"true" doc:"Timestamp of the last synchronization with the adapter"`
	LastError *string        `json:"last_error,omitempty" doc:"Last synchronization error message, if any"`
}

// Customer is reused unmodified as the request body for both create-customer
// and update-customer, as well as the response for both and get-customer.
// ID/CreatedBy/CreatedAt/UpdatedBy/UpdatedAt are readOnly:"true" (server-
// assigned). Slug and Integrations are accepted on create but not settable
// through update-customer today (integrations have their own dedicated
// endpoints; slug is immutable through this endpoint) -- update-customer's
// handler rejects either being present with a 422 rather than silently
// ignoring them.
type Customer struct {
	ID   uuid.UUID `json:"id" readOnly:"true" doc:"Unique identifier for the customer" example:"123e4567-e89b-12d3-a456-426614174000"`
	Name string    `json:"name" doc:"Name of the customer" example:"Awesome Customer" minLength:"1"`
	Slug string    `json:"slug,omitempty" doc:"Optional URL-friendly identifier, unique per organization. Auto-generated if not provided." example:"awesome-customer" minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	// ExternalCustomerID is required:"false" rather than omitempty: it is
	// nullable and always present on reads (a customer with none reads back
	// externalCustomerId: null, not an absent key). omitempty would make Go's
	// encoder drop the key entirely for a nil pointer, silently changing that
	// read shape. required:"false" keeps it optional on write without
	// touching read serialization.
	ExternalCustomerID *string                        `json:"externalCustomerId" required:"false" doc:"Optional identifier for the customer in an external system" example:"external-customer-id-12345"`
	Domain             *string                        `json:"domain,omitempty" doc:"Optional customer domain name" example:"example.tld" pattern:"^[a-z0-9_-]+(\\.[a-z0-9_-]+)+$"`
	Integrations       map[string]CustomerIntegration `json:"integrations,omitempty" doc:"Integrations grouped by adapter name"`
	CreatedBy          shared.User                    `json:"createdBy" readOnly:"true" doc:"User who created this customer"`
	CreatedAt          time.Time                      `json:"createdAt" readOnly:"true" doc:"Timestamp when the customer was created" example:"2023-10-01T12:00:00Z"`
	UpdatedBy          shared.User                    `json:"updatedBy" readOnly:"true" doc:"User who last updated this customer"`
	UpdatedAt          time.Time                      `json:"updatedAt" readOnly:"true" doc:"Timestamp when the customer was last updated" example:"2023-10-01T12:00:00Z"`
}

// CustomerPage is a cursor-paginated page of customers, returned by the
// GraphQL customers field -- the GraphQL counterpart of the REST
// getcustomers endpoint's pagination.Page[*Customer] envelope. It is a
// plain (non-generic) struct, rather than pagination.Page itself, because
// gqlgen's model binding (see gqlgen.yml) needs a concrete Go type to bind
// the CustomerPage GraphQL type to.
type CustomerPage struct {
	Items      []Customer
	NextCursor *string
	HasMore    bool
}
