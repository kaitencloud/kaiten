package openfeature

import "github.com/kaitencloud/kaiten/api/internal/shared/ptr"

// ResolutionDetails represents the result of a feature flag evaluation,
// including the resolved value and contextual information such as reason,
// variant, and any errors encountered.
type ResolutionDetails struct {
	// Value is the resolved flag value.
	// It can be of type bool, string, number, or structure (map[string]any).
	// This field is required.
	Value any `json:"value"`

	// ErrorCode indicates the standardized error category, if any occurred during evaluation.
	ErrorCode *ErrorCode `json:"errorCode,omitempty"`

	// ErrorMessage provides additional details about the error, if applicable.
	ErrorMessage *string `json:"errorMessage,omitempty"`

	// Reason explains why the evaluation resulted in this value (e.g. STATIC, DEFAULT, SPLIT, etc.).
	Reason *Reason `json:"reason,omitempty"`

	// Variant identifies the variant name of the flag that was evaluated, if applicable.
	Variant *string `json:"variant,omitempty"`

	// FlagMetadata holds additional metadata associated with the flag definition or evaluation.
	FlagMetadata *map[string]any `json:"flagMetadata,omitempty"`

	// MatchedRuleName is the name of the targeting rule that produced this result, if any.
	// Excluded from JSON so it never appears in the OFREP HTTP response.
	MatchedRuleName *string `json:"-"`
}

// NewSuccessResolutionDetails creates a successful resolution result
func NewSuccessResolutionDetails(variants map[string]any, metadata map[string]any, flagType, variantName string, reason Reason) ResolutionDetails {
	return ResolutionDetails{
		Value:        lookupVariantValue(variants, flagType, variantName),
		Variant:      &variantName,
		Reason:       ptr.To(reason),
		ErrorCode:    nil,
		ErrorMessage: nil,
		FlagMetadata: ptr.To(metadata),
	}
}

// NewFailureResolutionDetails creates an error resolution result
func NewFailureResolutionDetails(variants map[string]any, metadata map[string]any, flagType, variantName string, errorCode ErrorCode, errorMessage string) ResolutionDetails {
	return ResolutionDetails{
		Value:        lookupVariantValue(variants, flagType, variantName),
		Variant:      ptr.To(variantName),
		Reason:       ptr.To(ReasonError),
		ErrorCode:    ptr.To(errorCode),
		ErrorMessage: ptr.To(errorMessage),
		FlagMetadata: ptr.To(metadata),
	}
}

// lookupVariantValue finds the value of a variant by name, falling back to the
// declared flag type's zero value when there is no variant to serve.
func lookupVariantValue(variants map[string]any, flagType, variantName string) any {
	if variantName == "" {
		return zeroValueOf(flagType)
	}

	if value, ok := variants[variantName]; ok {
		return value
	}

	return zeroValueOf(flagType)
}

// zeroValueOf is what a resolution serves with no variant value to serve:
// nothing resolved, or a variant name outside the flag's set. It is the zero of
// the flag's declared type, not "" -- a string handed to a caller that asked for
// a boolean is a value its own SDK cannot unmarshal, on the failure path, where
// a caller is least equipped to notice.
func zeroValueOf(flagType string) any {
	switch flagType {
	case "boolean":
		return false
	case "number":
		return float64(0)
	case "object":
		return map[string]any{}
	default:
		// "string", and anything else: an empty string is the only honest
		// answer for a type this package does not know.
		return ""
	}
}
