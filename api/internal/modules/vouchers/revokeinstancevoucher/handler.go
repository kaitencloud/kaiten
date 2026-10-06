package revokeinstancevoucher

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "RevokeInstanceVoucher"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute revokes an ACTIVE redemption. Its row stays, with the reason.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, instanceVoucherID uuid.UUID, reason string) (*catalogue.Redemption, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, kaitenerrors.UnprocessableEntity(operation+".ReasonRequired", "a revocation gives its reason")
	}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var revoked catalogue.Redemption
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".NotFound", "instance %q not found", instanceSlug)
		}
		if err != nil {
			return err
		}
		locked, err := q.LockInstanceVoucher(ctx, db.LockInstanceVoucherParams{OrganizationID: user.OrganizationID, InstanceID: instance.ID, ID: instanceVoucherID})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".NotFound", "redemption %s not found", instanceVoucherID)
		}
		if err != nil {
			return err
		}
		if locked.Status != db.InstanceVoucherStatusACTIVE {
			return kaitenerrors.Conflict(operation+".NotActive", "only an ACTIVE redemption can be revoked")
		}
		now, err := catalogue.Now(ctx, q)
		if err != nil {
			return err
		}
		if err := q.RevokeInstanceVoucher(ctx, db.RevokeInstanceVoucherParams{
			Now: pgtype.Timestamp{Time: now, Valid: true, InfinityModifier: pgtype.Finite}, UserID: user.ID, Reason: &reason,
			OrganizationID: user.OrganizationID, ID: instanceVoucherID,
		}); err != nil {
			return err
		}
		list, err := catalogue.Redemptions(ctx, q, db.ListRedemptionsParams{
			OrganizationID: user.OrganizationID, InstanceID: nil, VoucherID: nil, ID: &instanceVoucherID, Status: nil,
		})
		if err != nil {
			return err
		}
		revoked = list[0]
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.InstanceVoucherRevoked.Name, events.InstanceVoucherRevoked.Type, revoked, nil))
	})
	if err != nil {
		return nil, err
	}
	return &revoked, nil
}
