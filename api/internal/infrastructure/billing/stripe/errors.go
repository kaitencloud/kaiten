package stripe

import (
	"context"
	"errors"
	"net/http"
	"regexp"

	stripego "github.com/stripe/stripe-go/v87"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// keyPattern matches Stripe keys, which Stripe echoes in some messages
// ("Invalid API Key provided: rk_test_****abcd", masked but for its last
// characters): a message never carries any part of one out.
var keyPattern = regexp.MustCompile(`\b(sk|rk|pk)_(live|test)_[A-Za-z0-9*]+`)

func scrub(message string) string { return keyPattern.ReplaceAllString(message, "[redacted]") }

// object is what a call addressed, for the not-found mapping.
type object int

const (
	objectNone object = iota
	objectCustomer
	objectInvoice
)

// classify turns a stripe-go error into a provider error billing maps the
// same way whatever the provider (§12.1 rule 6). Request bodies never appear.
func classify(err error, about object) error {
	if err == nil {
		return nil
	}
	var stripeErr *stripego.Error
	if !errors.As(err, &stripeErr) {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return &provider.Error{Class: provider.ClassUnavailable, Code: "timeout", Param: "", RequestID: "", Message: "Stripe did not answer in time"}
		}
		return &provider.Error{Class: provider.ClassUnavailable, Code: "network", Param: "", RequestID: "", Message: scrub(err.Error())}
	}
	out := &provider.Error{
		Class: provider.ClassUnavailable, Code: string(stripeErr.Code), Param: stripeErr.Param,
		RequestID: stripeErr.RequestID, Message: scrub(stripeErr.Msg),
	}
	status := stripeErr.HTTPStatusCode
	switch {
	case stripeErr.Type == stripego.ErrorTypeIdempotency && status == http.StatusConflict:
		// Another request with the same key is still running: retry later.
		out.Class = provider.ClassUnavailable
	case stripeErr.Type == stripego.ErrorTypeIdempotency:
		out.Class = provider.ClassParametersChanged
		if out.Code == "" {
			out.Code = "idempotency_error"
		}
	case status == http.StatusUnauthorized:
		out.Class, out.Code = provider.ClassNotConnected, "credentials_rejected"
	case status == http.StatusForbidden:
		out.Class, out.Code = provider.ClassNotConnected, "permission_missing"
	case status == http.StatusTooManyRequests, status >= 500, stripeErr.Code == stripego.ErrorCodeLockTimeout:
		out.Class = provider.ClassUnavailable
	case status == http.StatusNotFound || stripeErr.Code == stripego.ErrorCodeResourceMissing:
		switch about {
		case objectCustomer:
			out.Class = provider.ClassCustomerMissing
		case objectInvoice:
			out.Class = provider.ClassNotFound
		default:
			out.Class = provider.ClassRejected
		}
	case status == http.StatusBadRequest, status == http.StatusPaymentRequired:
		out.Class = provider.ClassRejected
	}
	return out
}

// isMissing reports a 404 resource_missing.
func isMissing(err error) bool {
	var stripeErr *stripego.Error
	return errors.As(err, &stripeErr) &&
		(stripeErr.HTTPStatusCode == http.StatusNotFound || stripeErr.Code == stripego.ErrorCodeResourceMissing)
}
