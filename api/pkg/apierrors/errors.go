// Package apierrors provides a unified error type for HTTP APIs, with
// Kinds that map to HTTP status codes. Under pkg/ so error handling stays a
// single source of truth instead of hand-synchronized copies.
package apierrors

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-playground/validator/v10"
)

// Kind represents the category of error.
type Kind int

const (
	KindUnknown Kind = iota
	KindNotFound
	KindUnauthorized
	KindForbidden
	KindConflict
	KindValidation
	KindUnprocessable
	KindInternal

	// KindUnavailable is a dependency this request needed to answer
	// correctly could not be reached — not a fault in the request, and
	// not a decision about it. It maps to 503, which is what tells the
	// client the call is worth retrying: nothing was decided, so nothing
	// has to be undone before trying again.
	//
	// Kept distinct from KindInternal because the two are different
	// promises. A 500 says this request failed and repeating it will
	// probably fail the same way; a 503 says the answer is unknown right
	// now. Kaiten's entitlement gate is the case that needs the
	// distinction: "you are over your limit" (KindConflict, terminal,
	// needs an upgrade) and "we could not check your limit" (this,
	// retryable) must not look alike to a client.
	KindUnavailable

	// KindTooManyRequests is a caller over its rate. It maps to 429, and the
	// answer carries Retry-After: like a 503 nothing was decided, but unlike
	// one, retrying sooner only makes it longer.
	KindTooManyRequests
)

// String returns a string representation of the Kind.
func (k Kind) String() string {
	switch k {
	case KindNotFound:
		return "NOT_FOUND"
	case KindUnauthorized:
		return "UNAUTHORIZED"
	case KindForbidden:
		return "FORBIDDEN"
	case KindConflict:
		return "CONFLICT"
	case KindValidation:
		return "VALIDATION"
	case KindUnprocessable:
		return "UNPROCESSABLE"
	case KindInternal:
		return "INTERNAL"
	case KindUnavailable:
		return "UNAVAILABLE"
	case KindTooManyRequests:
		return "TOO_MANY_REQUESTS"
	default:
		return "UNKNOWN"
	}
}

// Error is the single error type for all application errors.
type Error struct {
	Kind    Kind
	Code    string         // Machine-readable code like "Demo.NotDemoInstance"
	Message string         // Human-readable message
	Err     error          // Wrapped error (optional)
	Details map[string]any // Additional details (e.g., validation errors)
	// Errors are the problem's `errors` entries for a kind other than
	// Validation (whose entries come from Details): structured detail a
	// client can act on, such as the original report behind a 409.
	Errors []*ErrorDetail
	// RetryAfter, when positive, is sent as the Retry-After header: how long
	// to wait before trying again. Every 429 carries one, and so do the
	// refusals only time resolves -- a period being closed, a provider that
	// could not be reached. Set it with WithRetryAfter.
	RetryAfter time.Duration
}

// WithRetryAfter sets how long the caller should wait before retrying, and
// returns the error.
func (e *Error) WithRetryAfter(d time.Duration) *Error {
	e.RetryAfter = d
	return e
}

// RetryAfterSeconds is RetryAfter in whole seconds, rounded up, as the header
// carries it; 0 when there is none.
func (e *Error) RetryAfterSeconds() int {
	if e.RetryAfter <= 0 {
		return 0
	}
	return int(math.Ceil(e.RetryAfter.Seconds()))
}

// GetHeaders makes *Error satisfy huma.HeadersError, so Huma sends
// Retry-After with the problem body. pkg/fiberapi does the same for Fiber
// routes.
func (e *Error) GetHeaders() http.Header {
	headers := http.Header{}
	if seconds := e.RetryAfterSeconds(); seconds > 0 {
		headers.Set("Retry-After", strconv.Itoa(seconds))
	}
	return headers
}

func (e *Error) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *Error) Unwrap() error {
	return e.Err
}

// HTTPStatus returns the appropriate HTTP status code.
func (e *Error) HTTPStatus() int {
	switch e.Kind {
	case KindNotFound:
		return http.StatusNotFound
	case KindUnauthorized:
		return http.StatusUnauthorized
	case KindForbidden:
		return http.StatusForbidden
	case KindConflict:
		return http.StatusConflict
	case KindValidation:
		return http.StatusBadRequest
	case KindUnprocessable:
		return http.StatusUnprocessableEntity
	case KindInternal:
		return http.StatusInternalServerError
	case KindUnavailable:
		return http.StatusServiceUnavailable
	case KindTooManyRequests:
		return http.StatusTooManyRequests
	default:
		return http.StatusInternalServerError
	}
}

// GetStatus makes *Error satisfy huma.StatusError. Without it Huma treats
// every typed error a handler returns as an unhandled failure and routes it
// through NewErrorWithContext(ctx, 500, "unexpected error occurred", err) —
// the branch that has to assume the error text is internal and withhold it.
// Implementing it lets Huma render the error directly, from the
// status and code the constructor already carries.
func (e *Error) GetStatus() int { return e.HTTPStatus() }

// MarshalJSON renders the error as its RFC 9457 problem body, so an *Error
// serialized directly — which is what Huma does with a huma.StatusError —
// still reaches the client in the shared shape, without the wrapped
// internal cause. Kaiten's Huma setup additionally converts it through a
// transformer that can fill in `instance`; this is the floor for anything
// that does not.
func (e *Error) MarshalJSON() ([]byte, error) {
	return json.Marshal(ProblemFrom(e, ""))
}

// ContentType makes *Error satisfy huma.ContentTypeFilter, so a directly
// rendered error is still served as application/problem+json.
func (e *Error) ContentType(ct string) string {
	return (&Problem{}).ContentType(ct)
}

// ErrorCode returns the error code for API responses.
func (e *Error) ErrorCode() string {
	if e.Code != "" {
		return e.Code
	}
	return e.Kind.String()
}

// --- Constructors ---

func NotFound(code, message string) *Error {
	return &Error{Kind: KindNotFound, Code: code, Message: message}
}

// NotFoundf creates a not found error with a formatted message.
func NotFoundf(code, format string, args ...any) *Error {
	return &Error{Kind: KindNotFound, Code: code, Message: fmt.Sprintf(format, args...)}
}

func Unauthorized(code, message string) *Error {
	return &Error{Kind: KindUnauthorized, Code: code, Message: message}
}

func Forbidden(code, message string) *Error {
	return &Error{Kind: KindForbidden, Code: code, Message: message}
}

func Conflict(code, message string) *Error {
	return &Error{Kind: KindConflict, Code: code, Message: message}
}

// ConflictWithErrors is Conflict with `errors` entries on the problem body.
func ConflictWithErrors(code, message string, errs ...*ErrorDetail) *Error {
	return &Error{Kind: KindConflict, Code: code, Message: message, Errors: errs}
}

func Validation(code, message string) *Error {
	return &Error{Kind: KindValidation, Code: code, Message: message}
}

func ValidationWithDetails(code, message string, details map[string]any) *Error {
	return &Error{Kind: KindValidation, Code: code, Message: message, Details: details}
}

func UnprocessableEntity(code, message string) *Error {
	return &Error{Kind: KindUnprocessable, Code: code, Message: message}
}

// UnprocessableEntityWithErrors is UnprocessableEntity with `errors` entries on
// the problem body.
func UnprocessableEntityWithErrors(code, message string, errs ...*ErrorDetail) *Error {
	return &Error{Kind: KindUnprocessable, Code: code, Message: message, Errors: errs}
}

// UnprocessableEntityf creates an unprocessable entity error with a
// formatted message.
func UnprocessableEntityf(code, format string, args ...any) *Error {
	return &Error{Kind: KindUnprocessable, Code: code, Message: fmt.Sprintf(format, args...)}
}

func Internal(code, message string) *Error {
	return &Error{Kind: KindInternal, Code: code, Message: message}
}

// Unavailable reports that a dependency the request needed could not be
// reached, so the request was neither carried out nor refused on its merits.
// message is client-visible: say what could not be verified and that the call
// can be retried, never which host or credential was involved.
func Unavailable(code, message string) *Error {
	return &Error{Kind: KindUnavailable, Code: code, Message: message}
}

// Wrap wraps an existing error with additional context.
func Wrap(err error, kind Kind, code, message string) *Error {
	return &Error{Kind: kind, Code: code, Message: message, Err: err}
}

// Wrapf wraps an existing error with a formatted message.
func Wrapf(err error, kind Kind, code, format string, args ...any) *Error {
	return &Error{Kind: kind, Code: code, Message: fmt.Sprintf(format, args...), Err: err}
}

// --- Helper functions ---

func Is(err error, kind Kind) bool {
	var e *Error
	if errors.As(err, &e) {
		return e.Kind == kind
	}
	return false
}

func IsNotFound(err error) bool      { return Is(err, KindNotFound) }
func IsUnauthorized(err error) bool  { return Is(err, KindUnauthorized) }
func IsForbidden(err error) bool     { return Is(err, KindForbidden) }
func IsConflict(err error) bool      { return Is(err, KindConflict) }
func IsValidation(err error) bool    { return Is(err, KindValidation) }
func IsUnprocessable(err error) bool { return Is(err, KindUnprocessable) }
func IsUnavailable(err error) bool   { return Is(err, KindUnavailable) }

// TooManyRequests is a caller over its rate, who may try again after
// retryAfter (sent as Retry-After, at least one second).
func TooManyRequests(code, message string, retryAfter time.Duration) *Error {
	return &Error{Kind: KindTooManyRequests, Code: code, Message: message, RetryAfter: max(retryAfter, time.Second)}
}

// GetHTTPStatus extracts HTTP status from any error.
func GetHTTPStatus(err error) int {
	var e *Error
	if errors.As(err, &e) {
		return e.HTTPStatus()
	}
	return http.StatusInternalServerError
}

// GetCode extracts error code from any error.
func GetCode(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.ErrorCode()
	}
	return "INTERNAL_ERROR"
}

// GetDetails extracts error details from any error.
func GetDetails(err error) map[string]any {
	var e *Error
	if errors.As(err, &e) {
		return e.Details
	}
	return nil
}

// FromValidationError converts validator.ValidationErrors to our Error type.
func FromValidationError(err error) *Error {
	details := parseValidationErrors(err)
	return &Error{
		Kind:    KindValidation,
		Code:    "VALIDATION_FAILED",
		Message: "validation error",
		Details: details,
	}
}

func parseValidationErrors(err error) map[string]any {
	errorsMap := make(map[string]any)
	var validationErrs validator.ValidationErrors
	if errors.As(err, &validationErrs) {
		for _, fieldErr := range validationErrs {
			errorsMap[fieldErr.Field()] = fieldErr.Tag()
		}
	} else {
		errorsMap["errors"] = err.Error()
	}
	return errorsMap
}
