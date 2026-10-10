package listvouchers

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's vouchers, newest first.
func (u *UseCase) Execute(ctx context.Context, status, voucherType, restrictedCustomerSlug, cursor string, limit int32) (pagination.Page[catalogue.Voucher], error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return pagination.Page[catalogue.Voucher]{}, err
	}
	page, err := pagination.ParseKeyset(cursor, limit, "Vouchers")
	if err != nil {
		return pagination.Page[catalogue.Voucher]{}, err
	}
	params := db.ListVouchersParams{
		OrganizationID: user.OrganizationID, ID: nil, Code: nil, Status: nil, VoucherType: nil, CustomerSlug: nil,
		CursorAt: page.CursorAt, CursorID: page.CursorID, RowLimit: page.RowLimit,
	}
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
	vouchers, err := catalogue.List(ctx, u.deps.Queries(ctx), params, true)
	if err != nil {
		return pagination.Page[catalogue.Voucher]{}, err
	}
	return pagination.KeysetPage(vouchers, page, func(v catalogue.Voucher) (time.Time, uuid.UUID) { return v.CreatedAt, v.ID })
}
