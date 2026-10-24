// Package reactivatesessionsubscription is POST
// /public/session/billing/reactivate (§14.4): the session's customer takes back
// a cancellation scheduled for the period's end, before it.
package reactivatesessionsubscription

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	operation = "ReactivateSessionSubscription"
	core      = "ReactivateSubscription"
)

// Session is the customer session that reactivates.
type Session struct {
	InstanceSlug *string
}

// Reactivator is the billing module's operation, through a port this module
// owns.
type Reactivator interface {
	Execute(ctx context.Context, instanceSlug string) (*subscriptions.InstanceBilling, error)
}

type UseCase struct{ reactivate Reactivator }

func NewUseCase(reactivate Reactivator) *UseCase { return &UseCase{reactivate: reactivate} }

// Execute reverts the scheduled cancellation.
func (u *UseCase) Execute(ctx context.Context, session Session) (*sessions.SessionSubscription, error) {
	if session.InstanceSlug == nil {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InstanceRequired",
			"a reactivation is of one instance's subscription: mint the session with an instanceSlug")
	}
	reactivated, err := u.reactivate.Execute(ctx, *session.InstanceSlug)
	if err != nil {
		return nil, translate(err)
	}
	shown := sessions.SubscriptionFrom(*reactivated)
	return &shown, nil
}

// translate answers the Core refusals under this operation's name. The public
// contract has one answer for "nothing to take back" (Appendix A): no
// subscription, and one already ended, have no cancellation scheduled either.
func translate(err error) error {
	var refusal *kaitenerrors.Error
	if errors.As(err, &refusal) {
		switch refusal.Code {
		case core + ".NotFound":
			return kaitenerrors.Conflict(operation+".NotScheduledForCancellation", "this instance has no subscription")
		case core + ".Canceled":
			return kaitenerrors.Conflict(operation+".NotScheduledForCancellation",
				"the subscription has ended: check out a plan again to start a new one")
		}
	}
	return sessions.Rename(err, core, operation)
}
