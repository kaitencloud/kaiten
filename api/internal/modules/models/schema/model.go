package schema

import (
	"time"

	"github.com/google/uuid"
)

type Modality string

const (
	Text       Modality = "TEXT"
	Image      Modality = "IMAGE"
	Audio      Modality = "AUDIO"
	Video      Modality = "VIDEO"
	Embedding  Modality = "EMBEDDING"
	Multimodal Modality = "MULTIMODAL"
)

type Status string

const (
	Active Status = "ACTIVE"
	// Deprecated models keep their existing pricing, but take no new rules.
	Deprecated Status = "DEPRECATED"
	// Archived models remain addressable, but cannot authorize AI usage.
	Archived Status = "ARCHIVED"
)

// VendorCosts are optional USD costs, not credit conversion rates. Decimal
// strings preserve all twelve fractional digits of the catalogue's NUMERICs.
type VendorCosts struct {
	PerInputToken       *string `json:"perInputToken,omitempty" pattern:"^[0-9]{1,6}(\\.[0-9]{1,12})?$" example:"0.001"`
	PerCachedInputToken *string `json:"perCachedInputToken,omitempty" pattern:"^[0-9]{1,6}(\\.[0-9]{1,12})?$" example:"0.001"`
	PerCacheWriteToken  *string `json:"perCacheWriteToken,omitempty" pattern:"^[0-9]{1,6}(\\.[0-9]{1,12})?$" example:"0.001"`
	PerOutputToken      *string `json:"perOutputToken,omitempty" pattern:"^[0-9]{1,6}(\\.[0-9]{1,12})?$" example:"0.001"`
	PerRequest          *string `json:"perRequest,omitempty" pattern:"^[0-9]{1,6}(\\.[0-9]{1,12})?$" example:"0.001"`
	PerUnit             *string `json:"perUnit,omitempty" pattern:"^[0-9]{1,6}(\\.[0-9]{1,12})?$" example:"0.001"`
	Currency            string  `json:"currency" enum:"USD" default:"USD"`
}

// Model is reused for create, full-replace update and reads. Only identity and
// timestamps are server-assigned; slug and modality must be written back unchanged
// on update. Status moves freely between the three catalogue lifecycle states.
type Model struct {
	ID          uuid.UUID              `json:"id" readOnly:"true"`
	Name        string                 `json:"name" minLength:"1" maxLength:"100"`
	Slug        string                 `json:"slug" doc:"Immutable URL-friendly identifier, unique per organization" minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$" example:"sample-model"`
	Description *string                `json:"description,omitempty"`
	Vendor      string                 `json:"vendor" minLength:"1" maxLength:"100"`
	Modality    Modality               `json:"modality" enum:"TEXT,IMAGE,AUDIO,VIDEO,EMBEDDING,MULTIMODAL"`
	Status      Status                 `json:"status" enum:"ACTIVE,DEPRECATED,ARCHIVED" default:"ACTIVE" doc:"ACTIVE authorizes usage; DEPRECATED keeps existing rules; ARCHIVED authorizes none. Reversible."`
	ExternalIDs []string               `json:"externalIds" required:"false" nullable:"false" uniqueItems:"true" doc:"Exact provider identifiers, unique per organization; cannot shadow another model's slug"`
	VendorCosts VendorCosts            `json:"vendorCosts" required:"false"`
	Metadata    map[string]interface{} `json:"metadata" required:"false"`
	CreatedAt   time.Time              `json:"createdAt" readOnly:"true"`
	UpdatedAt   time.Time              `json:"updatedAt" readOnly:"true"`
}

// ModelUpdated is an auditable full snapshot of both sides of an update,
// including a lifecycle change. Both snapshots belong to the event's organization.
type ModelUpdated struct {
	Before *Model `json:"before"`
	After  *Model `json:"after"`
}
