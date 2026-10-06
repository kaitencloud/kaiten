package archivevoucher

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ArchiveVoucher"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute stops the voucher from being redeemed; redemptions keep applying.
func (u *UseCase) Execute(ctx context.Context, voucherID uuid.UUID) (*catalogue.Voucher, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var moved catalogue.Voucher
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, voucherID, operation)
		if err != nil {
			return err
		}
		if locked.Status == db.VoucherStatusARCHIVED {
			return kaitenerrors.Conflict(operation+".AlreadyArchived", "the voucher is already archived")
		}
		to := db.VoucherStatusARCHIVED
		if err := q.SetVoucherStatus(ctx, db.SetVoucherStatusParams{
			Status: to, UserID: user.ID, OrganizationID: user.OrganizationID, ID: voucherID,
		}); err != nil {
			return err
		}
		moved, err = catalogue.One(ctx, q, user.OrganizationID, &voucherID, nil, true, nil)
		if err != nil {
			return err
		}
		return catalogue.Announce(ctx, u.outbox, user.OrganizationID, events.VoucherArchived, moved)
	})
	if err != nil {
		return nil, err
	}
	return &moved, nil
}
