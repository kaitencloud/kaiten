// Package sessioninvoices lists what a customer session may read of its
// customer's invoices (§14.4): issued ones only, newest boundary first, of the
// customer by id -- and of its instance, for a session bound to one.
//
// It also learns outcomes early (§14.4 rule 10): after a checkout reported a
// charge waiting for 3-D Secure or still processing, the browser polls this
// list. Stripe's hosted invoice page returns nowhere, so Kaiten hears of the
// payment only from the provider: a listed invoice still awaiting its outcome
// and not read from the provider for 30 seconds is read now, by id, before the
// list is answered -- within a 5-second budget, at most once per invoice per
// 30 seconds -- so PAID shows within seconds instead of at the next sync.
package sessioninvoices

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncing"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ListSessionInvoices"

const (
	// staleAfter is how old a provider read must be before the list reads
	// again; it is also how often one invoice may be read.
	staleAfter = 30 * time.Second
	// refreshBudget bounds all the reads one list makes.
	refreshBudget = 5 * time.Second
)

// Query narrows the list.
type Query struct {
	CustomerID uuid.UUID
	// InstanceID, when set, lists that instance's invoices only.
	InstanceID *uuid.UUID
	Cursor     string
	Limit      int32
}

type cursorKey struct {
	At time.Time `json:"at"`
	ID uuid.UUID `json:"id"`
}

type UseCase struct {
	deps   access.Deps
	syncer *syncing.Syncer

	mu    sync.Mutex
	tried map[uuid.UUID]time.Time
}

func NewUseCase(deps access.Deps, syncer *syncing.Syncer) *UseCase {
	return &UseCase{deps: deps, syncer: syncer, tried: map[uuid.UUID]time.Time{}}
}

// Execute lists one page.
func (u *UseCase) Execute(ctx context.Context, query Query) (pagination.Page[invoices.Invoice], error) {
	empty := pagination.Page[invoices.Invoice]{}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return empty, err
	}
	var key *cursorKey
	if query.Cursor != "" {
		decoded, err := pagination.Decode[cursorKey](query.Cursor)
		if err != nil {
			if errors.Is(err, pagination.ErrInvalidCursor) {
				return empty, kaitenerrors.Validation(operation+".InvalidCursor", "the cursor is not one this list returned")
			}
			return empty, err
		}
		key = &decoded
	}
	limit := pagination.ClampLimit(query.Limit)

	rows, err := u.fetch(ctx, user.OrganizationID, query, key, limit)
	if err != nil {
		return empty, err
	}
	if u.refresh(ctx, rows) {
		if rows, err = u.fetch(ctx, user.OrganizationID, query, key, limit); err != nil {
			return empty, err
		}
	}

	items := make([]invoices.Invoice, 0, len(rows))
	for _, row := range rows {
		invoice, err := invoices.FromRow(row)
		if err != nil {
			return empty, err
		}
		items = append(items, invoice)
	}
	return pagination.BuildPage(items, limit, func(i invoices.Invoice) cursorKey {
		return cursorKey{At: i.BoundaryAt, ID: i.ID}
	})
}

func (u *UseCase) fetch(ctx context.Context, organizationID uuid.UUID, query Query, key *cursorKey, limit int32) ([]db.InstanceInvoice, error) {
	var cursor cursorKey
	if key != nil {
		cursor = *key
	}
	return u.deps.Queries(ctx).ListSessionInvoices(ctx, db.ListSessionInvoicesParams{
		OrganizationID: organizationID, CustomerID: &query.CustomerID, InstanceID: query.InstanceID,
		HasCursor: key != nil, CursorAt: invoices.Timestamp(cursor.At), CursorID: cursor.ID, PageSize: limit + 1,
	})
}

// refresh reads from the provider the listed invoices still awaiting their
// payment's outcome, and reports whether it read any.
func (u *UseCase) refresh(ctx context.Context, rows []db.InstanceInvoice) bool {
	if u.syncer == nil {
		return false
	}
	now, err := lifecycle.Now(ctx, u.deps.Queries(ctx))
	if err != nil {
		return false
	}
	budget, cancel := context.WithTimeout(ctx, refreshBudget)
	defer cancel()
	read := false
	for _, row := range rows {
		if !u.due(row, now) {
			continue
		}
		if budget.Err() != nil {
			break
		}
		if _, err := u.syncer.Invoice(budget, row); err != nil {
			slog.InfoContext(ctx, "could not read an invoice from its provider; the sync job will", "invoice_id", row.ID, "error", err)
			continue
		}
		read = true
	}
	return read
}

// due reports whether an invoice is read now: in a provider, still awaiting
// the outcome of its payment, not read for staleAfter, and not tried for as
// long by this replica.
func (u *UseCase) due(row db.InstanceInvoice, now time.Time) bool {
	if row.ProviderKind == db.BillingProviderKindNOOP || row.ExternalInvoiceID == nil ||
		(row.Status != db.InvoiceStatusPUSHED && row.Status != db.InvoiceStatusPAYMENTFAILED) {
		return false
	}
	if row.SyncedAt.Valid && now.Sub(row.SyncedAt.Time) < staleAfter {
		return false
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	for id, at := range u.tried {
		if now.Sub(at) >= staleAfter {
			delete(u.tried, id)
		}
	}
	if at, ok := u.tried[row.ID]; ok && now.Sub(at) < staleAfter {
		return false
	}
	u.tried[row.ID] = now
	return true
}
