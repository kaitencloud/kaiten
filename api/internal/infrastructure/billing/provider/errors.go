package provider

import (
	"errors"
	"fmt"
)

// Class is how billing treats a provider failure, whatever the provider.
type Class string

const (
	// ClassUnavailable: the provider could not be reached or answered with a
	// transient error (network, timeout, 5xx, rate limit). Retry later.
	ClassUnavailable Class = "UNAVAILABLE"
	// ClassNotConnected: the provider refused the organization's credentials
	// or lacks a permission.
	ClassNotConnected Class = "NOT_CONNECTED"
	// ClassRejected: the provider refused the request's data (an invalid
	// e-mail, a tax location); a human fixes it.
	ClassRejected Class = "REJECTED"
	// ClassCustomerMissing: the provider's customer Kaiten maps to is gone.
	ClassCustomerMissing Class = "CUSTOMER_MISSING"
	// ClassNotFound: the invoice is gone (a deleted draft).
	ClassNotFound Class = "NOT_FOUND"
	// ClassParametersChanged: one idempotency key was sent with different
	// parameters.
	ClassParametersChanged Class = "PARAMETERS_CHANGED"
)

// Error is a provider failure. Message is the provider's own, scrubbed of
// request bodies; RequestID identifies the call for the provider's support.
type Error struct {
	Class     Class
	Code      string
	Param     string
	RequestID string
	Message   string
}

func (e *Error) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("billing provider: %s (%s): %s", e.Class, e.Code, e.Message)
	}
	return fmt.Sprintf("billing provider: %s: %s", e.Class, e.Message)
}

// ClassOf is the class of a provider failure; an error that is not an *Error
// is treated as the provider being unavailable.
func ClassOf(err error) Class {
	var providerErr *Error
	if errors.As(err, &providerErr) {
		return providerErr.Class
	}
	return ClassUnavailable
}

// Summary is a provider failure as Kaiten records it (last_push_error,
// last_sync_error): the class and the provider's code and message, never a
// request body.
func Summary(err error) string {
	var providerErr *Error
	if errors.As(err, &providerErr) {
		s := string(providerErr.Class)
		if providerErr.Code != "" {
			s += " " + providerErr.Code
		}
		if providerErr.Message != "" {
			s += ": " + providerErr.Message
		}
		return truncate(s)
	}
	if errors.Is(err, ErrUnsupported) {
		return "UNSUPPORTED"
	}
	return truncate(string(ClassUnavailable) + ": " + err.Error())
}

func truncate(s string) string {
	const limit = 500
	if len(s) > limit {
		return s[:limit]
	}
	return s
}
