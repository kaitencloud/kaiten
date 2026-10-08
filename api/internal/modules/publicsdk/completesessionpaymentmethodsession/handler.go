// Package completesessionpaymentmethodsession is POST
// /public/session/billing/payment-method-session/{sessionId}/complete
// (§14.4): once the customer is back from the setup page, the session is
// checked with the provider -- never the redirect -- and its payment method
// becomes the one charged, as the Core operation does (§12.5).
package completesessionpaymentmethodsession

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
)

const (
	operation = "CompleteSessionPaymentMethodSession"
	core      = "CompletePaymentMethodSession"
)

// Session is the customer session completing the page.
type Session struct {
	CustomerSlug string
}

// Completer is the billing module's operation, through a port this module
// owns. It refuses a setup session of another customer as not found.
type Completer interface {
	Execute(ctx context.Context, customerSlug, sessionID string) (*completepaymentmethodsession.CompletedPaymentMethodSession, error)
}

type UseCase struct{ complete Completer }

func NewUseCase(complete Completer) *UseCase { return &UseCase{complete: complete} }

// Execute completes the setup session for the session's customer.
func (u *UseCase) Execute(ctx context.Context, session Session, setupSessionID string) (*completepaymentmethodsession.CompletedPaymentMethodSession, error) {
	completed, err := u.complete.Execute(ctx, session.CustomerSlug, setupSessionID)
	if err != nil {
		return nil, sessions.Rename(err, core, operation)
	}
	return completed, nil
}
