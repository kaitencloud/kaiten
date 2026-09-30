// Package schema holds the feature-flag domain model: the request/response
// types the featureflags module's HTTP endpoints exchange, plus the pure
// (behavior-free, aside from simple accessors) data these types carry.
// Evaluation and validation logic that acts on this data lives in the
// sibling evaluator and validator packages; low-level CEL/bucket-hash
// primitives live in internal/infrastructure/featureflag.
package schema

import (
	"time"

	"github.com/google/uuid"
)

type Type string

const (
	BasicType             Type = "basic"
	RolloutDateType       Type = "rollout_date"
	RolloutPercentageType Type = "rollout_percentage"
)

type RolloutStep struct {
	Variant    string    `json:"variant" example:"variant_b"`
	Percentage int       `json:"percentage" example:"50"`
	Date       time.Time `json:"date" example:"2024-01-15T10:00:00Z"`
}

type RolloutDate struct {
	Start RolloutStep `json:"start" example:"{\"variant\":\"variant_a\",\"percentage\":0,\"date\":\"2024-01-01T00:00:00Z\"}"`
	End   RolloutStep `json:"end" example:"{\"variant\":\"variant_a\",\"percentage\":100,\"date\":\"2024-01-31T23:59:59Z\"}"`
}

func (r *RolloutDate) Variants() []string {
	return []string{r.Start.Variant, r.End.Variant}
}

type RolloutPercentage struct {
	Distribution map[string]int64 `json:"distribution" example:"{\"variant_a\":70,\"variant_b\":30}"`
}

func (r *RolloutPercentage) Variants() []string {
	variants := make([]string, 0, len(r.Distribution))

	for key := range r.Distribution {
		variants = append(variants, key)
	}
	return variants
}

type Variant struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Value       interface{} `json:"value"`
}

// FeatureFlag is reused unmodified as the request body for both
// create-feature-flag and update-feature-flag, as well as the response for
// both and get-feature-flag. ID is readOnly:"true" (server-assigned).
type FeatureFlag struct {
	ID             uuid.UUID       `json:"id" readOnly:"true" example:"123e4567-e89b-12d3-a456-426614174000"`
	Type           string          `json:"type" example:"boolean" enum:"boolean,string,number,object" description:"Type of the feature flag. Can be boolean, string, number or object."`
	Variants       []Variant       `json:"variants" description:"List of variants for the feature flag. Each variant has a name, description and Value."`
	Targetings     Targetings      `json:"targetings" description:"List of targeting rules for the feature flag. Each basicTargeting defines how the feature flag is applied to users."`
	Name           string          `json:"name" example:"New Feature" description:"Name of the feature flag." minLength:"1"`
	Description    *string         `json:"description" example:"This is a new feature flag" description:"Description of the feature flag."`
	DefaultVariant *DefaultVariant `json:"default_variant" nullable:"false" description:"Default variant to use when no targeting rules match. Can be a string, rollout_date, or rollout_percentage."`
	Slug           string          `json:"slug,omitempty" example:"new-feature" description:"Optional URL-friendly identifier, unique across all organizations. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Metadata       map[string]any  `json:"metadata"`
	Enabled        bool            `json:"enabled" example:"true" description:"Indicates whether the feature flag is enabled or not."`
	EventName      string          `json:"event_name" example:"feature_flag_event" description:"Name of the event associated with the feature flag, used for tracking and analytics."`
}

func (f *FeatureFlag) GetVariantSet() map[string]any {
	variantSet := make(map[string]any)
	for _, variant := range f.Variants {
		variantSet[variant.Name] = variant.Value
	}
	return variantSet
}
