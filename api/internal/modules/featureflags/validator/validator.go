// Package validator checks a feature flag configuration is internally
// consistent: default and targeting variants reference variants that exist,
// variant values match the declared flag type, and targeting rules lint
// clean against the CEL engine.
package validator

import (
	"fmt"
	"reflect"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

// Validator validates feature flag configurations.
type Validator struct{}

// NewValidator creates a new Validator instance.
func NewValidator() *Validator {
	return &Validator{}
}

// ValidateFlag validates all aspects of a feature flag configuration, for a
// caller with no entitlement catalogue to check targeting slugs against.
func (v *Validator) ValidateFlag(flag *schema.FeatureFlag) error {
	return v.validateFlag(flag, nil)
}

/*
ValidateFlagInOrganization is ValidateFlag plus the checks that need to know what
the organization actually has.

Splitting them keeps the caller honest: `knownEntitlements` cannot be guessed,
and a validator that silently skipped the slug check when it was absent would be
the same silence this is meant to end. Callers with a catalogue pass it; the ones
without say so by calling ValidateFlag.
*/
func (v *Validator) ValidateFlagInOrganization(flag *schema.FeatureFlag, knownEntitlements []string) error {
	return v.validateFlag(flag, knownEntitlements)
}

// validateFlag is the single pass both entry points run. Layering them instead —
// ValidateFlagInOrganization calling ValidateFlag, then re-linting with the
// catalogue — parsed and type-checked every targeting rule through CEL twice on
// each create and update, building an environment each time, to reach the same
// verdict.
func (v *Validator) validateFlag(flag *schema.FeatureFlag, knownEntitlements []string) error {
	if flag == nil {
		return fmt.Errorf("flag cannot be nil")
	}

	availableVariants := extractVariantNames(flag.Variants)

	if err := v.validateDefaultVariantServeExistingVariants(flag.DefaultVariant, availableVariants); err != nil {
		return fmt.Errorf("invalid default variant for flag %q: %w", flag.Name, err)
	}

	if err := v.validateVariantTypesMatchFlagType(flag.Type, flag.Variants); err != nil {
		return fmt.Errorf("invalid variants for flag %q: %w", flag.Name, err)
	}

	if err := v.validateFallbackValueType(flag.Type, flag.Metadata); err != nil {
		return fmt.Errorf("invalid metadata for flag %q: %w", flag.Name, err)
	}

	if err := v.validateTargetingVariantsServeExistingVariants(flag.Targetings, availableVariants); err != nil {
		return fmt.Errorf("invalid targeting for flag %q: %w", flag.Name, err)
	}

	return v.validateTargetingRules(flag, knownEntitlements)
}

// validateTargetingRules refuses a rule that cannot work. At evaluation time
// such a rule does not raise — it simply never matches, and the flag stays on
// its default — so this is the only point where the mistake is visible.
func (v *Validator) validateTargetingRules(flag *schema.FeatureFlag, knownEntitlements []string) error {
	for _, targeting := range flag.Targetings {
		if err := featureflag.LintTargetingRule(targeting.GetRule().Value, knownEntitlements); err != nil {
			return fmt.Errorf("invalid targeting for flag %q: %w", flag.Name, err)
		}
	}

	return nil
}

// validateDefaultVariantServeExistingVariants ensures the default variant references exist.
func (v *Validator) validateDefaultVariantServeExistingVariants(defaultVariant schema.VariantsHolder, availableVariants []string) error {
	defaultVariantNames := defaultVariant.GetVariantValue().GetVariants()

	if len(defaultVariantNames) == 0 {
		return fmt.Errorf("default variant cannot be empty")
	}

	missingVariants := findMissingVariants(defaultVariantNames, availableVariants)
	if len(missingVariants) > 0 {
		return fmt.Errorf("default variant references non-existent variants: %v", missingVariants)
	}

	return nil
}

// validateTargetingVariantsServeExistingVariants ensures all targeting rules reference valid variants.
func (v *Validator) validateTargetingVariantsServeExistingVariants(targetings []schema.TargetingRule, availableVariants []string) error {
	for i, targeting := range targetings {
		targetingVariants := targeting.GetVariantValue().GetVariants()

		missingVariants := findMissingVariants(targetingVariants, availableVariants)
		if len(missingVariants) > 0 {
			return fmt.Errorf("targeting rule %d references non-existent variants: %v", i, missingVariants)
		}
	}

	return nil
}

// validateVariantTypesMatchFlagType ensures all variant values match the declared flag type.
func (v *Validator) validateVariantTypesMatchFlagType(flagType string, variants []schema.Variant) error {
	for _, variant := range variants {
		if variant.Value == nil {
			return fmt.Errorf("variant %q has nil value", variant.Name)
		}

		if err := validateVariantType(flagType, variant); err != nil {
			return err
		}
	}
	return nil
}

// validateFallbackValueType checks metadata["fallback_value"] against the flag type when present.
// The field is optional: if absent no error is returned.
func (v *Validator) validateFallbackValueType(flagType string, metadata map[string]any) error {
	fallback, exists := metadata["fallback_value"]
	if !exists || fallback == nil {
		return nil
	}

	if flagType == "object" {
		return nil
	}

	actualKind := reflect.TypeOf(fallback).Kind()
	if flagType == "number" {
		if isNumericKind(actualKind) {
			return nil
		}
		return fmt.Errorf("metadata fallback_value has type %s but flag type is %s", actualKind, flagType)
	}

	expectedKind, ok := flagTypeToReflectKind(flagType)
	if !ok {
		return fmt.Errorf("unknown flag type: %q", flagType)
	}

	if actualKind != expectedKind {
		return fmt.Errorf("metadata fallback_value has type %s but flag type is %s", actualKind, flagType)
	}

	return nil
}

// validateVariantType checks a single variant's value matches the expected type.
func validateVariantType(flagType string, variant schema.Variant) error {
	if flagType == "object" {
		return nil
	}

	variantType := reflect.TypeOf(variant.Value)
	if flagType == "number" {
		if isNumericKind(variantType.Kind()) {
			return nil
		}
		return fmt.Errorf("variant %q has type %s but flag type is %s",
			variant.Name, variantType.Kind(), flagType)
	}

	expectedKind, ok := flagTypeToReflectKind(flagType)

	if !ok {
		return fmt.Errorf("unknown flag type: %q", flagType)
	}

	if variantType.Kind() != expectedKind {
		return fmt.Errorf("variant %q has type %s but flag type is %s",
			variant.Name, variantType.Kind(), flagType)
	}

	return nil
}

func isNumericKind(kind reflect.Kind) bool {
	switch kind {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return true
	default:
		return false
	}
}

// flagTypeToReflectKind maps flag type strings to reflect.Kind.
func flagTypeToReflectKind(flagType string) (reflect.Kind, bool) {
	mapping := map[string]reflect.Kind{
		"boolean": reflect.Bool,
		"string":  reflect.String,
		"number":  reflect.Float64,
		"object":  reflect.Invalid, // Special case, accepts any type
	}

	kind, ok := mapping[flagType]
	return kind, ok
}

// extractVariantNames extracts variant names from a slice of variants.
func extractVariantNames(variants []schema.Variant) []string {
	names := make([]string, len(variants))
	for i, variant := range variants {
		names[i] = variant.Name
	}
	return names
}

// findMissingVariants returns variants from subset that don't exist in superset.
func findMissingVariants(subset, superset []string) []string {
	supersetMap := make(map[string]bool, len(superset))
	for _, v := range superset {
		supersetMap[v] = true
	}

	var missing []string
	for _, v := range subset {
		if !supersetMap[v] {
			missing = append(missing, v)
		}
	}

	return missing
}
