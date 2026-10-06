package claimhandoff

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ClaimHandoff"

// Defaults of a claim.
const (
	DefaultLimit        = 25
	DefaultLeaseSeconds = 900
)

// HandoffClaim is what a claim leased: one lease for every invoice it holds.
type HandoffClaim struct {
	LeaseID     uuid.UUID          `json:"leaseId" doc:"Pass it back when acknowledging an invoice of this claim"`
	LeasedUntil time.Time          `json:"leasedUntil" doc:"When the lease expires and the invoices are claimable again"`
	Invoices    []invoices.Invoice `json:"invoices" nullable:"false" doc:"The leased invoices, oldest issue first, with their billing e-mail: what the accounting system needs to book them"`
}

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute leases up to limit invoices waiting in the handoff queue for
// leaseSeconds. An invoice whose lease expires unacknowledged is claimed
// again: the queue delivers at least once, and a consumer deduplicates on
// the invoice id.
func (u *UseCase) Execute(ctx context.Context, limit, leaseSeconds int32) (*HandoffClaim, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if limit == 0 {
		limit = DefaultLimit
	}
	if leaseSeconds == 0 {
		leaseSeconds = DefaultLeaseSeconds
	}
	if limit < 1 || limit > 100 {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidLimit", "limit is between 1 and 100")
	}
	if leaseSeconds < 60 || leaseSeconds > 3600 {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidLeaseSeconds", "leaseSeconds is between 60 and 3600")
	}

	q := u.deps.Queries(ctx)
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	now := clock.Time.UTC()
	lease := uuid.New()
	until := now.Add(time.Duration(leaseSeconds) * time.Second)
	rows, err := q.ClaimHandoff(ctx, db.ClaimHandoffParams{
		LeaseID: &lease, LeasedUntil: invoices.Timestamp(until), Now: invoices.Timestamp(now),
		OrganizationID: user.OrganizationID, PageSize: limit,
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(rows, func(i, j int) bool {
		a, b := rows[i].IssuedAt.Time, rows[j].IssuedAt.Time
		if !a.Equal(b) {
			return a.Before(b)
		}
		return rows[i].ID.String() < rows[j].ID.String()
	})
	claimed := make([]invoices.Invoice, len(rows))
	for i, row := range rows {
		invoice, err := invoices.FromRow(row)
		if err != nil {
			return nil, err
		}
		claimed[i] = invoice
	}
	return &HandoffClaim{LeaseID: lease, LeasedUntil: until, Invoices: claimed}, nil
}
