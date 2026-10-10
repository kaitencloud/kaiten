// Package createsessionpaymentmethodsession is POST
// /public/session/billing/payment-method-session (§14.4): the provider-hosted
// page where a session's customer saves a payment method, opened as the Core
// operation opens it (§12.5), for the session's customer only.
package createsessionpaymentmethodsession

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	operation = "CreateSessionPaymentMethodSession"
	// core is the operation this one runs, whose refusals it answers under
	// its own name.
	core = "CreatePaymentMethodSession"
)

// NewSessionPaymentMethodSession is the page a session asks for.
type NewSessionPaymentMethodSession struct {
	ReturnURL string  `json:"returnUrl" format:"uri" doc:"Where the setup page sends the customer back, with kaiten_setup_session appended. Its origin must be one the organization's publishable keys allow." example:"https://app.example.test/billing"`
	Currency  *string `json:"currency,omitempty" doc:"The currency the payment method is set up in; required when the customer has no live subscription, whose currency is used otherwise" example:"EUR"`
}

// Session is the customer session the page is opened for, as the facade
// hands it over.
type Session struct {
	CustomerSlug   string
	AllowedOrigins []string
}

// Opener is the billing module's operation, through a port this module owns.
type Opener interface {
	Execute(ctx context.Context, customerSlug string, cmd createpaymentmethodsession.NewPaymentMethodSession) (*createpaymentmethodsession.PaymentMethodSession, error)
}

type UseCase struct{ open Opener }

func NewUseCase(open Opener) *UseCase { return &UseCase{open: open} }

// Execute opens the page for the session's customer.
func (u *UseCase) Execute(ctx context.Context, session Session, request NewSessionPaymentMethodSession) (*createpaymentmethodsession.PaymentMethodSession, error) {
	if !sessions.AllowedReturn(request.ReturnURL, session.AllowedOrigins) {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidReturnUrl",
			"returnUrl must be an https URL on an origin the vendor's publishable keys allow")
	}
	opened, err := u.open.Execute(ctx, session.CustomerSlug, createpaymentmethodsession.NewPaymentMethodSession{
		ReturnURL: request.ReturnURL, Currency: request.Currency,
	})
	if err != nil {
		return nil, sessions.Rename(err, core, operation)
	}
	return opened, nil
}
