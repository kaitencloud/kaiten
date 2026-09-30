package schema

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

const maxIconLength = 64

// iconTokenPattern matches a provider-namespaced icon token: "provider:name"
// (e.g. "lucide:rocket"). Both segments are lowercase kebab-case.
var iconTokenPattern = regexp.MustCompile(`^[a-z0-9]+:[a-z0-9]+(-[a-z0-9]+)*$`)

// SupportedIconProviders is the allow-list of accepted icon providers. This is the
// abstraction boundary: the backend validates the token *shape* and provider only,
// never the concrete icon catalog of any library. Adding a new provider (heroicons,
// custom assets, …) is a one-line change here with no coupling to the icon library.
var SupportedIconProviders = map[string]struct{}{
	"lucide": {},
}

// ValidateIcon checks that an icon token is well-formed and uses a supported
// provider. An empty token is rejected; callers should skip validation when the
// icon is unset (nil).
func ValidateIcon(icon string) error {
	if len(icon) > maxIconLength {
		return fmt.Errorf("icon must be at most %d characters", maxIconLength)
	}
	if !iconTokenPattern.MatchString(icon) {
		return fmt.Errorf("icon must match the provider:name format, e.g. lucide:rocket")
	}

	provider := icon[:strings.IndexByte(icon, ':')]
	if _, ok := SupportedIconProviders[provider]; !ok {
		return fmt.Errorf("unsupported icon provider %q", provider)
	}

	return nil
}

func IsSupportedAggregationMethod(method AggregationMethod) bool {
	switch method {
	case Count, Sum, Average, Max, Min, Latest:
		return true
	default:
		return false
	}
}

// ValidateUnitsConfiguration enforces the unit-field rules for an entitlement:
// unit fields are only allowed on NUMBER entitlements, unitSingular/unitPlural
// are all-or-none, and the sale unit trio (saleUnitSingular, saleUnitPlural,
// saleUnitFactor) is all-or-none and requires the base unit pair. These rules
// mirror the entitlement_*unit*_check constraints in the database.
func ValidateUnitsConfiguration(
	entitlementType Type,
	unitSingular, unitPlural *string,
	saleUnitSingular, saleUnitPlural *string,
	saleUnitFactor *float64,
) error {
	anyUnitField := unitSingular != nil || unitPlural != nil ||
		saleUnitSingular != nil || saleUnitPlural != nil || saleUnitFactor != nil

	if !IsNumberFamily(entitlementType) && anyUnitField {
		return fmt.Errorf("unit fields are only allowed when type is NUMBER or NUMBER_AI_CREDIT")
	}

	for _, label := range []*string{unitSingular, unitPlural, saleUnitSingular, saleUnitPlural} {
		if label != nil && strings.TrimSpace(*label) == "" {
			return fmt.Errorf("unit labels must not be empty")
		}
	}

	if (unitSingular == nil) != (unitPlural == nil) {
		return fmt.Errorf("unitSingular and unitPlural must be provided together")
	}

	saleUnitFieldsSet := 0
	for _, set := range []bool{saleUnitSingular != nil, saleUnitPlural != nil, saleUnitFactor != nil} {
		if set {
			saleUnitFieldsSet++
		}
	}
	if saleUnitFieldsSet != 0 && saleUnitFieldsSet != 3 {
		return fmt.Errorf("saleUnitSingular, saleUnitPlural and saleUnitFactor must be provided together")
	}
	if saleUnitFieldsSet == 3 && unitSingular == nil {
		return fmt.Errorf("sale unit fields require unitSingular and unitPlural to be set")
	}

	if saleUnitFactor != nil && *saleUnitFactor <= 0 {
		return fmt.Errorf("saleUnitFactor must be greater than 0")
	}

	return nil
}

func ValidateTypeConfiguration(entitlementType Type, aggregationMethod *AggregationMethod) error {
	switch entitlementType {
	case Number, NumberAICredit:
		if aggregationMethod == nil {
			return fmt.Errorf("aggregationMethod is required when type is %s", entitlementType)
		}
		if !IsSupportedAggregationMethod(*aggregationMethod) {
			return fmt.Errorf("aggregationMethod must be one of COUNT, SUM, AVERAGE, MAX, MIN, LATEST")
		}
	case Boolean, Config:
		if aggregationMethod != nil {
			return fmt.Errorf("aggregationMethod must be null when type is %s", entitlementType)
		}
	default:
		return fmt.Errorf("unsupported entitlement type %q", entitlementType)
	}

	return nil
}

// ValidateResetConfiguration enforces the periodic-usage-window rules for
// entitlement.resetPeriod/resetAnchor: resetAnchor is required exactly when
// resetPeriod is set, periodic reset is only allowed for NUMBER-family
// entitlements (NUMBER, NUMBER_AI_CREDIT), and it is incompatible with
// aggregationMethod LATEST, since a "most recent value" has no meaningful
// per-window reset. Mirrors the entitlement_reset_anchor_required_check,
// entitlement_reset_period_number_family_check and
// entitlement_reset_period_latest_check constraints in the database. Does
// not enforce immutability -- that is the one-way-door rule, checked by
// comparing against the stored entitlement at the update handler layer.
func ValidateResetConfiguration(entitlementType Type, aggregationMethod *AggregationMethod, resetPeriod *period.ResetPeriod, resetAnchor *period.ResetAnchor) error {
	if resetPeriod == nil {
		if resetAnchor != nil {
			return fmt.Errorf("resetAnchor must be null when resetPeriod is null")
		}
		return nil
	}

	if !resetPeriod.Valid() {
		return fmt.Errorf("resetPeriod must be one of HOUR, DAY, WEEK, MONTH, YEAR")
	}
	if resetAnchor == nil {
		return fmt.Errorf("resetAnchor is required when resetPeriod is set")
	}
	if !resetAnchor.Valid() {
		return fmt.Errorf("resetAnchor must be one of CALENDAR, LICENSE_START")
	}
	if !IsNumberFamily(entitlementType) {
		return fmt.Errorf("resetPeriod is only allowed when type is NUMBER or NUMBER_AI_CREDIT")
	}
	if aggregationMethod != nil && *aggregationMethod == Latest {
		return fmt.Errorf("resetPeriod is incompatible with aggregationMethod LATEST")
	}

	return nil
}

// ValidateWarningThresholdConfiguration enforces the entitlement-level
// early-warning field: warningThresholdPercent is only meaningful for
// entitlements that report numeric usage (NUMBER and NUMBER_AI_CREDIT).
//
// Enforcement itself (hard/soft/unlimited) is not a catalogue-level concern: it
// is derived per license grant from the grant's own value and
// limit_cap_exceeded_overage_percent, not validated here.
func ValidateWarningThresholdConfiguration(entitlementType Type, warningThresholdPercent *int32) error {
	if !IsNumberFamily(entitlementType) {
		if warningThresholdPercent != nil {
			return fmt.Errorf("warningThresholdPercent is only allowed when type is NUMBER or NUMBER_AI_CREDIT")
		}
		return nil
	}

	if warningThresholdPercent != nil && (*warningThresholdPercent < 0 || *warningThresholdPercent > 100) {
		return fmt.Errorf("warningThresholdPercent must be between 0 and 100")
	}

	return nil
}
