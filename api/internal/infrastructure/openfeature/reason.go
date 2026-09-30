package openfeature

// Reason represents why a feature flag evaluation resulted in a particular value.
type Reason string

const (
	// ReasonStatic — The resolved value is static (no dynamic evaluation).
	ReasonStatic Reason = "STATIC"

	// ReasonDefault — The resolved value fell back to a pre-configured value (no dynamic evaluation occurred or dynamic evaluation yielded no result).
	ReasonDefault Reason = "DEFAULT"

	// ReasonTargetingMatch — The resolved value was the result of a dynamic evaluation, such as a rule or specific user-targeting.
	ReasonTargetingMatch Reason = "TARGETING_MATCH"

	// ReasonSplit — The resolved value was the result of pseudorandom assignment.
	ReasonSplit Reason = "SPLIT"

	// ReasonCached — The resolved value was retrieved from a cache.
	ReasonCached Reason = "CACHED"

	// ReasonDisabled — The resolved value was the result of the flag being disabled in the management system.
	ReasonDisabled Reason = "DISABLED"

	// ReasonUnknown — The reason for the resolved value could not be determined.
	ReasonUnknown Reason = "UNKNOWN"

	// ReasonStale — The resolved value is non-authoritative or possibly out of date.
	ReasonStale Reason = "STALE"

	// ReasonError — The resolved value was the result of an error.
	ReasonError Reason = "ERROR"

	// ReasonOther — The resolved value reason does not match a predefined reason; use for custom cases.
	ReasonOther Reason = "OTHER"
)
