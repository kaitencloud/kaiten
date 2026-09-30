package openfeature

// ErrorCode represents a standardized reason for a feature flag evaluation error.
type ErrorCode string

const (
	// ErrorCodeProviderNotReady — The value was resolved before the provider was initialized.
	ErrorCodeProviderNotReady ErrorCode = "PROVIDER_NOT_READY"

	// ErrorCodeFlagNotFound — The flag could not be found.
	ErrorCodeFlagNotFound ErrorCode = "FLAG_NOT_FOUND"

	// ErrorCodeParseError — An error was encountered parsing data, such as a flag configuration.
	ErrorCodeParseError ErrorCode = "PARSE_ERROR"

	// ErrorCodeTypeMismatch — The type of the flag value does not match the expected type.
	ErrorCodeTypeMismatch ErrorCode = "TYPE_MISMATCH"

	// ErrorCodeTargetingKeyMissing — The provider requires a targeting key and one was not provided in the evaluation context.
	ErrorCodeTargetingKeyMissing ErrorCode = "TARGETING_KEY_MISSING"

	// ErrorCodeInvalidContext — The evaluation context does not meet provider requirements.
	ErrorCodeInvalidContext ErrorCode = "INVALID_CONTEXT"

	// ErrorCodeProviderFatal — The provider has entered an irrecoverable error state.
	ErrorCodeProviderFatal ErrorCode = "PROVIDER_FATAL"

	// ErrorCodeGeneral — The error was for a reason not enumerated above.
	ErrorCodeGeneral ErrorCode = "GENERAL"
)
