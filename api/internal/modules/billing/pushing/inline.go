package pushing

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// InlineWait bounds how long a request waits for an inline push (§12.4 rule 6).
const InlineWait = 20 * time.Second

// InlineLease is how long the queue leaves alone an invoice composed for an
// inline push: the lease the push would take, taken at composition instead so
// the queue cannot claim the invoice between the commit and the push.
const InlineLease = lease

// Inline pushes one invoice right after the transaction that composed it has
// committed -- the self-serve checkout's ACTIVATION, and a vendor subscribe's
// charged automatically -- so the caller can report the charge's outcome
// instead of "within a minute".
//
// The invoice was composed leased (invoices.Draft.PushLeasedUntil), so the
// queue does not push it meanwhile; the push runs the same steps under the
// same idempotency keys, and the caller waits at most wait. Waiting ends the
// wait, not the push: it goes on in the background, persisting each step, and
// whatever it leaves -- a failure, an unknown charge -- the queue resumes on
// its usual backoff, at the latest when the lease lapses. The caller reads the
// invoice afterwards and reports its status as persisted.
func (p *Pusher) Inline(ctx context.Context, invoiceID uuid.UUID, wait time.Duration) {
	done := make(chan struct{})
	go func() {
		defer close(done)
		// Detached from the request: a client that hangs up, or a wait that
		// ends, must not abandon a push between a provider call and the write
		// that records it.
		if err := p.Push(context.WithoutCancel(ctx), invoiceID, false); err != nil {
			slog.WarnContext(ctx, "inline push failed; the queue retries it", "invoice_id", invoiceID, "error", err)
		}
	}()
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-done:
	case <-timer.C:
		slog.InfoContext(ctx, "inline push still running after the wait; it completes in the background", "invoice_id", invoiceID)
	case <-ctx.Done():
	}
}
