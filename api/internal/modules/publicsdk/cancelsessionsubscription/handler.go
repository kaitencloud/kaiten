// Package cancelsessionsubscription is POST /public/session/billing/cancel
// (§14.4): the session's customer cancels the subscription of the instance the
// session is bound to, at the end of the period paid for. It is the vendor's
// cancellation, made on the customer's behalf, with one mode only: cancelling
// immediately, with a FINAL invoice, is the vendor's to decide (§9.3).
package cancelsessionsubscription

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	operation = "CancelSessionSubscription"
	core      = "CancelSubscription"
)

// SessionCancellation is why the customer cancels.
type SessionCancellation struct {
	Reason *string `json:"reason,omitempty" doc:"Why the customer cancels, up to 500 characters; the vendor sees it on the subscription"`
}

// Session is the customer session that cancels.
type Session struct {
	InstanceSlug *string
}

// Canceler is the billing module's operation, through a port this module owns.
type Canceler interface {
	Execute(ctx context.Context, instanceSlug, mode string, reason *string) (*cancelsubscription.CanceledSubscription, error)
}

type UseCase struct{ cancel Canceler }

func NewUseCase(cancel Canceler) *UseCase { return &UseCase{cancel: cancel} }

// Execute schedules the cancellation for the period's end; a trial ends at
// once, with nothing to pay. Repeating it changes nothing.
func (u *UseCase) Execute(ctx context.Context, session Session, request SessionCancellation) (*sessions.SessionSubscription, error) {
	if session.InstanceSlug == nil {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InstanceRequired",
			"a cancellation is of one instance's subscription: mint the session with an instanceSlug")
	}
	canceled, err := u.cancel.Execute(ctx, *session.InstanceSlug, cancelsubscription.ModeAtPeriodEnd, request.Reason)
	if err != nil {
		return nil, translate(err)
	}
	shown := sessions.SubscriptionFrom(canceled.InstanceBilling)
	return &shown, nil
}

// translate answers the Core refusals under this operation's name. An
// instance never subscribed has no subscription to cancel, which the public
// contract answers as one already canceled (Appendix A: "absent or CANCELED").
func translate(err error) error {
	var refusal *kaitenerrors.Error
	if errors.As(err, &refusal) && refusal.Code == core+".NotFound" {
		return kaitenerrors.Conflict(operation+".NotActive", "this instance has no subscription to cancel")
	}
	return sessions.Rename(err, core, operation)
}
