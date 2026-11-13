package deletevoucher

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "DeleteVoucher"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute deletes a voucher no instance ever redeemed, whatever its status,
// with its grants and flag grants: the entitlements and flags they pinned are
// released and its code is free again. One redeemed at least once is history
// and stays; archiving retires it.
//
// The decision is made under the voucher's row lock. A redemption's count
// increment updates that row, so it either committed before the lock was
// granted (redemptions_count is then above zero) or waits for the delete and
// finds no voucher. redemptions_count never goes down, revocation and an
// instance's deletion included, so it says "ever redeemed".
func (u *UseCase) Execute(ctx context.Context, voucherID uuid.UUID) error {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return err
	}
	return u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, voucherID, operation)
		if err != nil {
			return err
		}
		if locked.RedemptionsCount > 0 {
			return redeemed("this voucher was redeemed: it is history and cannot be deleted; archive it instead")
		}
		pending, err := q.VoucherAwaitsPayment(ctx, db.VoucherAwaitsPaymentParams{OrganizationID: user.OrganizationID, VoucherID: voucherID})
		if err != nil {
			return err
		}
		if pending {
			return redeemed("a checkout waiting for its payment already discounted this voucher: archive it instead, " +
				"or delete it once that checkout has expired unpaid")
		}
		// The event carries the voucher as it was, as VOUCHER_ARCHIVED does.
		gone, err := catalogue.One(ctx, q, user.OrganizationID, &voucherID, nil, false, nil)
		if err != nil {
			return err
		}
		err = q.DeleteVoucher(ctx, db.DeleteVoucherParams{OrganizationID: user.OrganizationID, ID: voucherID})
		if kaitenerrors.IsForeignKeyViolation(err) {
			// instance_voucher RESTRICTs the delete: the backstop of the count.
			return redeemed("this voucher was redeemed: it is history and cannot be deleted; archive it instead")
		}
		if err != nil {
			return err
		}
		return catalogue.Announce(ctx, u.outbox, user.OrganizationID, events.VoucherDeleted, gone)
	})
}

func redeemed(reason string) error {
	return kaitenerrors.Conflict(operation+".Redeemed", reason)
}
