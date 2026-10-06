package createvoucher

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateVoucher"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute creates a DRAFT voucher.
func (u *UseCase) Execute(ctx context.Context, draft catalogue.VoucherDraft) (*catalogue.Voucher, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var created catalogue.Voucher
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		resolved, err := draft.Resolve(ctx, q, operation, user.OrganizationID, user.ID)
		if err != nil {
			return err
		}
		id, err := q.InsertVoucher(ctx, resolved.Params)
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "voucher_organization_id_code_normalized_key") {
			return kaitenerrors.Conflict(operation+".CodeConflict", "another voucher has this code, compared without case or separators")
		}
		if err != nil {
			return err
		}
		if err := catalogue.WriteGrants(ctx, q, operation, user.OrganizationID, id, draft.Grants, resolved.Entitlements); err != nil {
			return err
		}
		created, err = catalogue.One(ctx, q, user.OrganizationID, &id, nil, true, nil)
		if err != nil {
			return err
		}
		return catalogue.Announce(ctx, u.outbox, user.OrganizationID, events.VoucherCreated, created)
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}
