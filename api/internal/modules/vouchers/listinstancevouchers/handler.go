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
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	return u.ExecuteWithinOperation(ctx, instanceSlug, status)
}

// ExecuteWithinOperation composes a parent operation using its already-resolved
// platform decision. It performs no provider evaluation while a transaction is held.
func (u *UseCase) ExecuteWithinOperation(ctx context.Context, instanceSlug, status string) ([]catalogue.Redemption, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}

	ctx = u.deps.AIPolicy.ForOrganization(ctx, user.OrganizationID)
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
