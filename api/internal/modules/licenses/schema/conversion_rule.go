package schema

import (
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
)

type ConversionRuleStatus string

const (
	ConversionRuleActive   ConversionRuleStatus = "ACTIVE"
	ConversionRuleArchived ConversionRuleStatus = "ARCHIVED"
)

// ConversionRates are exact decimal strings. Nil is unpriced, not zero.
type ConversionRates struct {
	PerRequest          *string `json:"perRequest,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
	PerInputToken       *string `json:"perInputToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
	PerCachedInputToken *string `json:"perCachedInputToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
	PerCacheWriteToken  *string `json:"perCacheWriteToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
	PerOutputToken      *string `json:"perOutputToken,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
	PerUnit             *string `json:"perUnit,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
	PerSecond           *string `json:"perSecond,omitempty" nullable:"true" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
}

type ConversionRule struct {
	ID                       uuid.UUID              `json:"id" format:"uuid"`
	LicenseSlug              string                 `json:"licenseSlug"`
	EntitlementSlug          string                 `json:"entitlementSlug"`
	ModelSlug                *string                `json:"modelSlug"`
	RequestType              *aicredit.RequestType  `json:"requestType" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	Rates                    ConversionRates        `json:"rates"`
	MinimumCreditsPerRequest string                 `json:"minimumCreditsPerRequest" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$"`
	MaximumCreditsPerRequest *string                `json:"maximumCreditsPerRequest" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$"`
	ChargeOnError            aicredit.ChargeOnError `json:"chargeOnError" enum:"NEVER,ALWAYS,PROVIDER_ERROR_ONLY"`
	Status                   ConversionRuleStatus   `json:"status" enum:"ACTIVE,ARCHIVED"`
	GrantedByLicense         bool                   `json:"grantedByLicense"`
	CreatedAt                time.Time              `json:"createdAt"`
	UpdatedAt                time.Time              `json:"updatedAt"`
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
