// Package checkoutsweep is the work on anonymous checkout sessions no
// visitor's request does (§12.9, §16.2): the sync backstop's completions, of a
// setup the visitor finished without coming back; billing-lifecycle step (f),
// which completes or reaps the sessions still OPEN at their expiry; and step
// (h), which deletes the sessions closed longer ago than the retention.
//
// The billing module drives it through its CheckoutSweeper port.
package checkoutsweep

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/checkoutsetup"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkoutprogress"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
)

// operation names what a setup read refuses, as the confirm's.
const operation = "ConfirmCheckoutSession"

// The work it runs, through ports this package owns.
type (
	// Completer is the confirm's job completion.
	Completer interface {
		Complete(ctx context.Context, organizationID, sessionID uuid.UUID) (bool, error)
	}
	// SetupReader reads a session's hosted setup at the provider.
	SetupReader interface {
		Read(ctx context.Context, organizationID uuid.UUID, operation string, checkoutSessionID uuid.UUID, setupSessionID string) (checkoutsetup.Setup, error)
	}
	// Binder binds the principal a completion runs under: system:kaiten, in
	// the organization, naming the session (§24 #76).
	Binder func(ctx context.Context, organizationID, sessionID uuid.UUID) (context.Context, error)
)

// Deps is what the sweep needs.
type Deps struct {
	Uof       *uow.UnitOfWork
	Completer Completer
	Setup     SetupReader
	Bind      Binder
	// Retention is how long a closed session is kept (step (h)); 0 is the
	// default, 90 days.
	Retention time.Duration
}

// DefaultRetention is how long a closed session is kept unless configured
// (v3.2 ruling of 2026-10-21).
const DefaultRetention = 90 * 24 * time.Hour

type Sweep struct {
	deps   Deps
	outbox *outbox.ScopedRepository
}

func New(deps Deps) *Sweep {
	return &Sweep{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Complete runs the completion of one session whose setup the provider
// reported complete: the sync backstop's (§12.6 rule 4). A session already
// applied changes nothing.
func (s *Sweep) Complete(ctx context.Context, organizationID, sessionID uuid.UUID) error {
	ctx, err := s.deps.Bind(ctx, organizationID, sessionID)
	if err != nil {
		return err
	}
	_, err = s.deps.Completer.Complete(ctx, organizationID, sessionID)
	return err
}

// RetryCompleted retries, by id, the completion of the organization's OPEN
// sessions whose setup completed, oldest first, at most limit: what a sync
// pass does whatever its events (§12.6 rule 4). The sessions that failed.
func (s *Sweep) RetryCompleted(ctx context.Context, organizationID uuid.UUID, limit int) ([]uuid.UUID, error) {
	ids, err := db.New(s.deps.Uof.DBTX(ctx)).ListSetupCompletedCheckoutSessions(ctx, db.ListSetupCompletedCheckoutSessionsParams{
		OrganizationID: organizationID, RowLimit: int32(limit), //nolint:gosec // bounded by the caller
	})
	if err != nil {
		return nil, err
	}
	var failed []uuid.UUID
	for _, id := range ids {
		if err := s.Complete(ctx, organizationID, id); err != nil {
			slog.WarnContext(ctx, "anonymous checkout: the completion will be retried", "checkout_session_id", id, "error", err)
			failed = append(failed, id)
		}
	}
	return failed, nil
}

// Abandon is billing-lifecycle step (f): each session still OPEN at its
// expiry, at most limit. One with a hosted setup is read at the provider first,
// outside any transaction: complete, the completion runs instead; still open,
// it waits for the page's own expiry (30 minutes at most); expired, or with no
// setup, the session is reaped. A completion that fails is reaped all the
// same: what the visitor saved stays at the provider, unmapped, and nothing
// was charged (§12.9). How many sessions it closed.
func (s *Sweep) Abandon(ctx context.Context, limit int) (int, error) {
	q := db.New(s.deps.Uof.DBTX(ctx))
	lapsed, err := q.ListLapsedCheckoutSessions(ctx, int32(limit)) //nolint:gosec // bounded by the batch size
	if err != nil {
		return 0, err
	}
	closed := 0
	for _, row := range lapsed {
		if row.ExternalSetupSessionID != nil {
			setup, err := s.deps.Setup.Read(ctx, row.OrganizationID, operation, row.ID, *row.ExternalSetupSessionID)
			if err != nil {
				slog.WarnContext(ctx, "anonymous checkout: its setup could not be read; the next pass reads it", "checkout_session_id", row.ID, "error", err)
				continue
			}
			switch {
			case setup.Complete:
				err := s.Complete(ctx, row.OrganizationID, row.ID)
				if err == nil {
					closed++
					continue
				}
				slog.WarnContext(ctx, "anonymous checkout: its completion failed at its expiry; reaped", "checkout_session_id", row.ID, "error", err)
			case !setup.Expired && setup.Page.ExpiresAt.After(time.Now()):
				continue // the visitor may still finish the page
			}
		}
		reaped, err := s.reap(ctx, row.OrganizationID, row.ID)
		if err != nil {
			return closed, fmt.Errorf("reap checkout session %s: %w", row.ID, err)
		}
		if reaped {
			closed++
		}
	}
	return closed, nil
}

// reap makes an OPEN session ABANDONED, with CHECKOUT_SESSION_ABANDONED; no
// other row exists to remove (INV-34).
func (s *Sweep) reap(ctx context.Context, organizationID, sessionID uuid.UUID) (bool, error) {
	reaped := false
	err := s.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.deps.Uof.DBTX(ctx))
		_, err := q.AbandonCheckoutSession(ctx, db.AbandonCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // completed or reaped meanwhile
		}
		if err != nil {
			return err
		}
		row, err := q.GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
		if err != nil {
			return err
		}
		reaped = true
		return s.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
			events.CheckoutSessionAbandoned.Name, events.CheckoutSessionAbandoned.Type,
			checkoutprogress.Event(row, checkout.StatusAbandoned), nil))
	})
	return reaped, err
}

// Purge is billing-lifecycle step (h): the sessions closed longer ago than
// the retention, at most limit, with no event. How many it deleted.
func (s *Sweep) Purge(ctx context.Context, limit int) (int, error) {
	retention := s.deps.Retention
	if retention <= 0 {
		retention = DefaultRetention
	}
	before := time.Now().UTC().Add(-retention)
	deleted, err := db.New(s.deps.Uof.DBTX(ctx)).PurgeClosedCheckoutSessions(ctx, db.PurgeClosedCheckoutSessionsParams{
		ClosedBefore: pgtime.TimePtrToPgTimestamp(&before), RowLimit: int32(limit), //nolint:gosec // bounded by the batch size
	})
	return int(deleted), err
}
