package listvouchers

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's vouchers, newest first.
func (u *UseCase) Execute(ctx context.Context, status, voucherType, restrictedCustomerSlug string) ([]catalogue.Voucher, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	params := db.ListVouchersParams{OrganizationID: user.OrganizationID, ID: nil, Code: nil, Status: nil, VoucherType: nil, CustomerSlug: nil}
	if status != "" {
		s := db.VoucherStatus(status)
		params.Status = &s
	}
	if voucherType != "" {
		t := db.VoucherType(voucherType)
		params.VoucherType = &t
	}
	if restrictedCustomerSlug != "" {
		params.CustomerSlug = &restrictedCustomerSlug
	}
	return catalogue.List(ctx, u.deps.Queries(ctx), params, true)
}
