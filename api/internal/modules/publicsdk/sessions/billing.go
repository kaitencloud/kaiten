package sessions

import (
	"errors"
	"net/url"
	"slices"
	"strings"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// AllowedReturn reports whether a return URL is on one of the origins the
// session's organization allows its publishable keys on (§14.2): the only
// places a provider-hosted page may send the customer back to.
func AllowedReturn(raw string, origins []string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	return slices.Contains(origins, strings.ToLower(u.Scheme+"://"+u.Host))
}

// Rename answers a refusal of the Core operation a session route runs under
// the session route's own name (§14.4: "errors mirror §13.10 under
// <SessionOperation>."): CreatePaymentMethodSession.CurrencyRequired becomes
// CreateSessionPaymentMethodSession.CurrencyRequired, with the same status,
// message and detail. Anything else passes through.
func Rename(err error, from, to string) error {
	var refusal *kaitenerrors.Error
	if !errors.As(err, &refusal) || !strings.HasPrefix(refusal.Code, from+".") {
		return err
	}
	renamed := *refusal
	renamed.Code = to + strings.TrimPrefix(refusal.Code, from)
	return &renamed
}
