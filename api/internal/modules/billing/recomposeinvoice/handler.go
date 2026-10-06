package recomposeinvoice

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoiceaction"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	operation          = "RecomposeInvoice"
	boundaryConstraint = "instance_invoice_boundary_key"
	replacesConstraint = "instance_invoice_replaces_invoice_id_key"

	// RecomposedReason is what a held invoice's release says when its
	// recompose found the journal sound.
	RecomposedReason = "recomposed"
)

// Result is a recomposed invoice, and whether it is a new one.
type Result struct {
	Invoice  invoices.Invoice
	Replaced bool
}

type UseCase struct {
	deps   access.Deps
	closer *closing.Closer
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps, closer *closing.Closer) *UseCase {
	return &UseCase{deps: deps, closer: closer, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute composes an invoice again from the journal as it is now, keeping
// its BASE lines as they were sold. A held DRAFT is rewritten in place:
// issued when its journal is now sound, held again otherwise. A VOID invoice
// gets a replacement for the same boundary, under the subscription's current
// terms and billing e-mail.
func (u *UseCase) Execute(ctx context.Context, invoiceID uuid.UUID) (*Result, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var result *Result
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		sub, row, err := invoiceaction.Lock(ctx, q, user.OrganizationID, invoiceID, operation+".NotFound")
		if err != nil {
			return err
		}
		held := row.Status == db.InvoiceStatusDRAFT && row.HoldReason != nil
		if !held && row.Status != db.InvoiceStatusVOID {
			return kaitenerrors.Conflict(operation+".InvalidStatus",
				"only a held DRAFT or a VOID invoice can be recomposed; void this one first")
		}
		if sub.InstanceID == nil {
			return kaitenerrors.Conflict(operation+".InstanceDeleted", "the invoice's instance was deleted: its usage cannot be measured again")
		}
		if row.Status == db.InvoiceStatusVOID {
			if replacement, err := q.GetReplacementInvoiceID(ctx, &row.ID); err == nil {
				return alreadyReplaced(replacement)
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		}

		recomposed, err := u.closer.Recompose(ctx, q, sub, row, held)
		if errors.Is(err, rating.ErrAmountOverflow) {
			return kaitenerrors.Internal("ComposeInvoice.AmountOverflow", "an invoice amount overflows 64-bit minor units")
		}
		if err != nil {
			return err
		}
		terms, err := u.closer.Terms(ctx, q, sub)
		if err != nil {
			return err
		}
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		now := clock.Time.UTC()

		var updated db.InstanceInvoice
		if held {
			former, err := invoices.FromRow(row)
			if err != nil {
				return err
			}
			updated, err = invoices.Rewrite(ctx, q, row, &recomposed.Composition, recomposed.Hold,
				invoices.Release{By: &user.ID, Reason: RecomposedReason}, terms, now)
			if err != nil {
				return err
			}
			if recomposed.Hold == nil {
				var detail invoices.HoldDetail
				if former.HoldDetail != nil {
					detail = *former.HoldDetail
				}
				if err := u.closer.Released(ctx, updated, user.ID.String(), detail); err != nil {
					return err
				}
			}
		} else {
			var billingEmail *string
			if sub.CustomerID != nil {
				customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: sub.OrganizationID, ID: *sub.CustomerID})
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				billingEmail = customer.BillingEmail
			}
			replaces := row.ID
			updated, err = invoices.Insert(ctx, q, invoices.Draft{
				Subscription: sub, LicenseID: row.LicenseID, LicenseSlug: row.LicenseSlug, BillingEmail: billingEmail,
				Kind: rating.Kind(row.Kind), BoundaryAt: row.BoundaryAt.Time.UTC(), Composition: recomposed.Composition,
				Terms: terms, Hold: recomposed.Hold, ReplacesInvoiceID: &replaces, Now: now,
			})
			if kaitenerrors.IsUniqueViolationOnConstraint(err, boundaryConstraint) || kaitenerrors.IsUniqueViolationOnConstraint(err, replacesConstraint) {
				return kaitenerrors.Conflict(operation+".AlreadyReplaced", "another live invoice already bills this boundary")
			}
			if err != nil {
				return err
			}
			if err := invoices.AnnounceComposed(ctx, u.outbox, updated); err != nil {
				return err
			}
		}
		invoice, err := invoices.FromRow(updated)
		if err != nil {
			return err
		}
		result = &Result{Invoice: invoice, Replaced: !held}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func alreadyReplaced(replacement uuid.UUID) error {
	return kaitenerrors.ConflictWithErrors(operation+".AlreadyReplaced", "this VOID invoice was already recomposed",
		&kaitenerrors.ErrorDetail{Message: "the replacement invoice", Location: "replacementInvoiceId", Value: map[string]any{"replacementInvoiceId": replacement}})
}
