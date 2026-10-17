package listinstancevouchers

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the vouchers an instance redeemed, newest first.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, status string) ([]catalogue.Redemption, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.NotFoundf("ListInstanceVouchers.InstanceNotFound", "instance %q not found", instanceSlug)
	}
	if err != nil {
		return nil, err
	}
	params := db.ListRedemptionsParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID, VoucherID: nil, ID: nil, Status: nil, CursorAt: pgtype.Timestamp{}, CursorID: nil, RowLimit: nil}
	if status != "" {
		s := db.InstanceVoucherStatus(status)
		params.Status = &s
	}
	return catalogue.Redemptions(ctx, q, params)
}
