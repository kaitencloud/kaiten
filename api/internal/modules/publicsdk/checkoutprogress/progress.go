// Package checkoutprogress moves an anonymous checkout session along with the
// INCOMPLETE subscription its completion created (§9.12 rule 5): the billing
// module calls it, through its CheckoutFollower port, from the transaction
// that records the ACTIVATION paid and from the one that ends the
// subscription unpaid.
package checkoutprogress

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/telemetry"
)

// Follower implements billing's ports.CheckoutFollower.
type Follower struct {
	uof    *uow.UnitOfWork
	outbox *outbox.ScopedRepository
}

func New(uof *uow.UnitOfWork) *Follower {
	return &Follower{uof: uof, outbox: outbox.NewScopedRepository(uof)}
}

// Paid completes the session waiting on the instance's payment, with
// com.kaiten.checkout_session.v1.completed.
func (f *Follower) Paid(ctx context.Context, organizationID, instanceID uuid.UUID) error {
	return f.close(ctx, organizationID, instanceID, checkout.StatusCompleted)
}

// Ended expires it, with com.kaiten.checkout_session.v1.abandoned and status
// EXPIRED: the customer and the instance remain, for the vendor to clean up.
func (f *Follower) Ended(ctx context.Context, organizationID, instanceID uuid.UUID) error {
	return f.close(ctx, organizationID, instanceID, checkout.StatusExpired)
}

func (f *Follower) close(ctx context.Context, organizationID, instanceID uuid.UUID, status string) error {
	q := db.New(f.uof.DBTX(ctx))
	id, err := q.LockAwaitingCheckoutSession(ctx, db.LockAwaitingCheckoutSessionParams{OrganizationID: organizationID, InstanceID: &instanceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // not an anonymous checkout's, or no longer waiting
	}
	if err != nil {
		return err
	}
	event := events.CheckoutSessionCompleted
	if status == checkout.StatusCompleted {
		err = q.PayCheckoutSession(ctx, db.PayCheckoutSessionParams{OrganizationID: organizationID, ID: id})
	} else {
		event = events.CheckoutSessionAbandoned
		err = q.ExpireCheckoutSession(ctx, db.ExpireCheckoutSessionParams{OrganizationID: organizationID, ID: id})
	}
	if err != nil {
		return err
	}
	row, err := q.GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: id})
	if err != nil {
		return err
	}
	// Recorded in billing's transaction: a rollback after it overcounts one.
	if status == checkout.StatusCompleted {
		telemetry.Completed(ctx, row.CreatedAt.Time, row.ClosedAt.Time)
	} else {
		telemetry.SessionEntered(ctx, status)
	}
	return f.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, event.Name, event.Type, Event(row, status), nil))
}

// Event is a session's event payload, as the session now reads.
func Event(row db.GetCheckoutSessionRow, status string) checkout.SessionEvent {
	period := ""
	if row.PriceBillingPeriod != nil {
		period = string(*row.PriceBillingPeriod)
	}
	return checkout.SessionEvent{
		SessionID: row.ID, Email: row.Email, ClientReferenceID: row.ClientReferenceID, LicenseSlug: row.LicenseSlug,
		BillingPeriod: period, CustomerSlug: row.CustomerSlug, InstanceSlug: row.InstanceSlug, Status: status,
	}
}
