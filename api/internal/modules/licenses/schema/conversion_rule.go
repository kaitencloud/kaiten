package schema

import (
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type ConversionRuleStatus string

const (
	ConversionRuleActive   ConversionRuleStatus = "ACTIVE"
	ConversionRuleArchived ConversionRuleStatus = "ARCHIVED"
)

// ConversionRates are exact decimal strings. Nil is unpriced, not zero.
type ConversionRates struct {
	PerRequest          *string `json:"perRequest,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$" example:"0.001"`
	PerInputToken       *string `json:"perInputToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$" example:"0.001"`
	PerCachedInputToken *string `json:"perCachedInputToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$" example:"0.001"`
	PerCacheWriteToken  *string `json:"perCacheWriteToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$" example:"0.001"`
	PerOutputToken      *string `json:"perOutputToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$" example:"0.001"`
	PerUnit             *string `json:"perUnit,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$" example:"0.001"`
	PerSecond           *string `json:"perSecond,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$" example:"0.001"`
}

type ConversionRule struct {
	ID                       uuid.UUID              `json:"id" format:"uuid"`
	LicenseSlug              string                 `json:"licenseSlug"`
	EntitlementSlug          string                 `json:"entitlementSlug"`
	ModelSlug                *string                `json:"modelSlug"`
	RequestType              *aicredit.RequestType  `json:"requestType" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	Rates                    ConversionRates        `json:"rates"`
	MinimumCreditsPerRequest string                 `json:"minimumCreditsPerRequest" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$" example:"0.001"`
	MaximumCreditsPerRequest *string                `json:"maximumCreditsPerRequest" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$" example:"0.001"`
	ChargeOnError            aicredit.ChargeOnError `json:"chargeOnError" enum:"NEVER,ALWAYS,PROVIDER_ERROR_ONLY"`
	Status                   ConversionRuleStatus   `json:"status" enum:"ACTIVE,ARCHIVED"`
	GrantedByLicense         bool                   `json:"grantedByLicense"`
	GrantedByAddons          bool                   `json:"grantedByAddons" doc:"Whether an add-on version compatible with the licence's family grants the pool, whatever its lifecycle state: instances of the licence can then hold the pool without the licence granting it. It says nothing of what any instance holds."`
	CreatedAt                time.Time              `json:"createdAt"`
	CreatedBy                shared.User            `json:"createdBy" readOnly:"true" doc:"User who created this rule; a service account is a user"`
	UpdatedAt                time.Time              `json:"updatedAt"`
	UpdatedBy                shared.User            `json:"updatedBy" readOnly:"true" doc:"User who last changed this rule: its pricing, or its archival"`
}

type ConversionRuleUpdated struct {
	Before *ConversionRule `json:"before"`
	After  *ConversionRule `json:"after"`
}

// Huma emits nullable enum fields as type [string,null] without adding null to
// enum. Both constraints apply in JSON Schema, so make wildcard null valid.
func (ConversionRule) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	s.Properties["requestType"].Enum = append(s.Properties["requestType"].Enum, nil)
	return s
}
