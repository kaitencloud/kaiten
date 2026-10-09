package closing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
)

// pageSize is how many due subscriptions one selection reads.
const pageSize = 50

// Scope narrows which due subscriptions a batch closes: one organization's,
// one instance's, or every one.
type Scope struct {
	OrganizationID *uuid.UUID
	InstanceID     *uuid.UUID
}

// ClosePeriodsReport is what a batch did.
type ClosePeriodsReport struct {
	Examined int             `json:"examined" doc:"Subscriptions the batch looked at"`
	Closed   int             `json:"closed" doc:"Periods closed into an invoice"`
	Held     int             `json:"held" doc:"Of those, invoices held as DRAFTs for their usage journal"`
	Skipped  int             `json:"skipped" doc:"Subscriptions left for later: held by another transaction, their meters' clock not at the boundary, or failed (logged)"`
	HasMore  bool            `json:"hasMore" doc:"Set when due subscriptions are left beyond the batch"`
	Invoices []ClosedInvoice `json:"invoices" nullable:"false"`
}

// ActorFor names the user a close in an organization is recorded under.
type ActorFor func(ctx context.Context, organizationID uuid.UUID) (uuid.UUID, error)

// CloseDue closes up to limit due subscriptions in scope, oldest boundary
// first. A subscription several periods behind closes one boundary per
// transaction and is selected again until it is no longer due. Each one is
// its own unit: an error or a panic in one is logged and leaves it for a
// later pass, and the batch moves on without selecting it again.
func (c *Closer) CloseDue(ctx context.Context, scope Scope, limit int, actorFor ActorFor) (ClosePeriodsReport, error) {
	report := ClosePeriodsReport{Examined: 0, Closed: 0, Held: 0, Skipped: 0, HasMore: false, Invoices: []ClosedInvoice{}}
	excluded := []uuid.UUID{}
	q := c.deps.Queries(ctx)
	for report.Examined < limit {
		if err := ctx.Err(); err != nil {
			return report, err
		}
		due, err := c.selectDue(ctx, q, scope, excluded, min(pageSize, limit-report.Examined))
		if err != nil {
			return report, err
		}
		if len(due) == 0 {
			return report, nil
		}
		for _, sub := range due {
			report.Examined++
			started := time.Now()
			outcome, err := c.closeUnit(ctx, sub, actorFor)
			switch {
			case err != nil:
				slog.ErrorContext(ctx, "billing period close failed",
					"instance_billing_id", sub.ID, "organization_id", sub.OrganizationID, "error", err)
				c.m.failed(ctx, errors.Is(err, errPanicked))
				report.Skipped++
				excluded = append(excluded, sub.ID)
			case !outcome.Closed:
				report.Skipped++
				excluded = append(excluded, sub.ID)
			default:
				report.Closed++
				if outcome.Invoice != nil {
					c.m.closed(ctx, *outcome.Invoice, time.Since(started))
				}
				if outcome.Invoice.Held {
					report.Held++
				}
				report.Invoices = append(report.Invoices, *outcome.Invoice)
			}
			if report.Examined >= limit {
				break
			}
		}
	}
	more, err := c.selectDue(ctx, q, scope, excluded, 1)
	if err != nil {
		return report, err
	}
	report.HasMore = len(more) > 0
	return report, nil
}

func (c *Closer) selectDue(ctx context.Context, q *db.Queries, scope Scope, excluded []uuid.UUID, size int) ([]db.ListDueSubscriptionsRow, error) {
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	return q.ListDueSubscriptions(ctx, db.ListDueSubscriptionsParams{
		DueBefore:      invoices.Timestamp(clock.Time.UTC().Add(-c.grace)),
		OrganizationID: scope.OrganizationID,
		InstanceID:     scope.InstanceID,
		Excluded:       excluded,
		PageSize:       int32(size), //nolint:gosec // bounded by pageSize
	})
}

// closeUnit closes one subscription, turning a panic into an error so one
// subscription cannot stop the batch.
// errPanicked marks a unit that panicked, for the failure metric.
var errPanicked = errors.New("panic")

func (c *Closer) closeUnit(ctx context.Context, sub db.ListDueSubscriptionsRow, actorFor ActorFor) (outcome Outcome, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%w closing subscription %s: %v", errPanicked, sub.ID, r)
		}
	}()
	actor, err := actorFor(ctx, sub.OrganizationID)
	if err != nil {
		return Outcome{}, err
	}
	return c.CloseOne(ctx, sub.ID, actor)
}
