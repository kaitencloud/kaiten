package apierrors

import (
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
)

// Problem is the RFC 9457 "Problem Details" body every Kaiten HTTP
// response uses — Huma routes, Fiber routes and the hand-written token
// validation endpoint alike. Before this type existed each of the three
// rendered its own shape and put the machine-readable code in a different
// member (Huma in errors[0].message, Fiber in title, validatetoken in a
// bespoke `error` string), so a client could not write a single error
// handler without knowing which router had served the route.
type Problem struct {
	// Type is a URI reference identifying the problem type.
	Type string `json:"type,omitempty" format:"uri" default:"about:blank" example:"https://tools.ietf.org/html/rfc7231#section-6.5.4" doc:"A URI reference to human-readable documentation for the error."`

	// Title is a short, static summary of the problem type.
	Title string `json:"title,omitempty" example:"Not Found" doc:"A short, human-readable summary of the problem type. This value should not change between occurrences of the error."`

	// Status is the HTTP status code, repeated for client convenience.
	Status int `json:"status,omitempty" example:"404" doc:"HTTP status code"`

	// Detail explains this specific occurrence.
	Detail string `json:"detail,omitempty" example:"license not found" doc:"A human-readable explanation specific to this occurrence of the problem."`

	// Instance identifies the specific occurrence — the request path.
	Instance string `json:"instance,omitempty" example:"/api/licenses/enterprise" doc:"A URI reference that identifies the specific occurrence of the problem."`

	// Code is the machine-readable business error code. It is the one
	// member a client should switch on: unlike `status` it distinguishes
	// the ~124 business failures that share an HTTP status, and unlike
	// `detail` it is stable and not localizable.
	Code string `json:"code,omitempty" example:"License.NotFound" doc:"Stable, machine-readable error code."`

	// ErrorID correlates a sanitized response with the server-side log
	// entry that holds the real cause. Present only when the cause was
	// withheld from the client.
	ErrorID string `json:"errorId,omitempty" example:"3f6b1a2c-7c1e-4d0b-9d5f-2b0a1c4e8d31" doc:"Correlation id for the server-side log entry describing the withheld cause."`

	// Errors lists individual problems, typically per-field request
	// validation failures.
	Errors []*ErrorDetail `json:"errors,omitempty" doc:"Optional list of individual error details"`
}

// ErrorDetail describes one individual problem inside a Problem.
type ErrorDetail struct {
	// Message is a human-readable explanation of this detail.
	Message string `json:"message,omitempty" doc:"Error message text"`

	// Location is a path-like string indicating where the error occurred,
	// e.g. `body.items[3].tags` or `path.thing-id`.
	Location string `json:"location,omitempty" doc:"Where the error occurred, e.g. 'body.items[3].tags' or 'path.thing-id'"`

	// Value is the offending value, echoed back to help debugging.
	Value any `json:"value,omitempty" doc:"The value at the given location"`
}

// Error satisfies the error interface with the occurrence-specific detail.
func (m *Problem) Error() string { return m.Detail }

// GetStatus satisfies huma.StatusError, so a Problem returned from the
// error factory sets the response status.
func (m *Problem) GetStatus() int { return m.Status }

// ContentType satisfies huma.ContentTypeFilter so error bodies are served
// as `application/problem+json` per RFC 9457, matching what pkg/fiberapi
// has always set by hand.
func (m *Problem) ContentType(ct string) string {
	switch ct {
	case "application/json":
		return "application/problem+json"
	case "application/cbor":
		return "application/problem+cbor"
	default:
		return ct
	}
}

// RFC references used as problem type URIs.
const (
	TypeValidation    = "https://tools.ietf.org/html/rfc7231#section-6.5.1"
	TypeUnauthorized  = "https://tools.ietf.org/html/rfc7235#section-3.1"
	TypeForbidden     = "https://tools.ietf.org/html/rfc7231#section-6.5.3"
	TypeNotFound      = "https://tools.ietf.org/html/rfc7231#section-6.5.4"
	TypeConflict      = "https://tools.ietf.org/html/rfc7231#section-6.5.8"
	TypeUnprocessable = "https://tools.ietf.org/html/rfc4918#section-11.2"
	TypeInternal      = "https://tools.ietf.org/html/rfc7231#section-6.6.1"
	TypeUnavailable   = "https://tools.ietf.org/html/rfc7231#section-6.6.4"
)

// NewProblem builds a problem body from the primitives every renderer
// has: a status, a machine-readable code and a human-readable detail.
func NewProblem(status int, code, detail, instance string) *Problem {
	return &Problem{
		Type:     TypeFromStatus(status),
		Title:    TitleFromStatus(status),
		Status:   status,
		Detail:   detail,
		Instance: instance,
		Code:     code,
	}
}

// ProblemFrom builds the problem body for err. A *Error contributes its
// own status, code and public message; anything else is rendered as an
// opaque 500 — its text is internal and never reaches the client.
func ProblemFrom(err error, instance string) *Problem {
	var appErr *Error
	if !errors.As(err, &appErr) {
		return NewProblem(
			http.StatusInternalServerError,
			KindInternal.String(),
			"An unexpected error occurred",
			instance,
		)
	}

	// The client-visible detail must never include the wrapped internal
	// cause (Error.Error() appends it via "%s: %v") — only the message the
	// constructor was given.
	detail := appErr.Message
	if detail == "" {
		detail = "An unexpected error occurred"
	}

	model := NewProblem(appErr.HTTPStatus(), appErr.ErrorCode(), detail, instance)
	if appErr.Kind == KindValidation {
		model.Errors = detailsToErrors(appErr.Details)
	}
	return model
}

// detailsToErrors projects the field -> reason map that FromValidationError
// and ValidationWithDetails produce onto the RFC 9457 `errors` list, so both
// routers report validation failures in the same member with the same shape
// as Huma's own request-validation details.
func detailsToErrors(details map[string]any) []*ErrorDetail {
	if len(details) == 0 {
		return nil
	}

	out := make([]*ErrorDetail, 0, len(details))
	for field, reason := range details {
		out = append(out, &ErrorDetail{
			Message:  fmt.Sprintf("%v", reason),
			Location: "body." + field,
		})
	}
	// Map iteration order is random; the response body must not be.
	slices.SortFunc(out, func(a, b *ErrorDetail) int {
		return strings.Compare(a.Location, b.Location)
	})
	return out
}

// TypeFromStatus maps an HTTP status to the problem type URI documenting it.
func TypeFromStatus(status int) string {
	switch status {
	case http.StatusBadRequest:
		return TypeValidation
	case http.StatusUnauthorized:
		return TypeUnauthorized
	case http.StatusForbidden:
		return TypeForbidden
	case http.StatusNotFound:
		return TypeNotFound
	case http.StatusConflict:
		return TypeConflict
	case http.StatusUnprocessableEntity:
		return TypeUnprocessable
	case http.StatusServiceUnavailable:
		return TypeUnavailable
	default:
		return TypeInternal
	}
}

// TitleFromStatus returns the short, static summary for a status. RFC 9457
// requires `title` not to vary between occurrences of the same problem
// type, which is exactly why the business code moved to `code`: Fiber used
// to put the code here.
func TitleFromStatus(status int) string {
	if text := http.StatusText(status); text != "" {
		return text
	}
	if status >= 400 && status < 500 {
		return "Client Error"
	}
	return "Internal Server Error"
}

// KindFromStatus is the inverse of Error.HTTPStatus, used to give a code to
// problems that have a status but no typed error behind them.
func KindFromStatus(status int) Kind {
	switch status {
	case http.StatusNotFound:
		return KindNotFound
	case http.StatusUnauthorized:
		return KindUnauthorized
	case http.StatusForbidden:
		return KindForbidden
	case http.StatusConflict:
		return KindConflict
	case http.StatusBadRequest:
		return KindValidation
	case http.StatusUnprocessableEntity:
		return KindUnprocessable
	case http.StatusInternalServerError:
		return KindInternal
	case http.StatusServiceUnavailable:
		return KindUnavailable
	default:
		return KindUnknown
	}
}
