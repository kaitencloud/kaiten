package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/archivevoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/createvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/getvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/listinstancevouchers"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/listvoucherredemptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/listvouchers"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/lookupvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/publishvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/redeemvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/revokeinstancevoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/updatevoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/validatevoucher"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Vouchers is the voucher module's operations: the voucher catalogue, and
// the vouchers instances redeem. Every one of them is behind the billing
// switch.
//
// See Customers for the naming and argument-order convention.
type Vouchers struct {
	uc *vouchers.UseCases
}

// Vouchers returns the voucher surface.
func (k *Kaiten) Vouchers() Vouchers {
	return Vouchers{uc: k.modules.Vouchers}
}

func (v Vouchers) CreateVoucher(ctx context.Context, cl caller.OrganizationCaller, draft catalogue.VoucherDraft) (*catalogue.Voucher, error) {
	if err := cl.Require(createvoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.CreateVoucher.Execute(bindOrganization(ctx, cl), draft)
}

func (v Vouchers) ListVouchers(ctx context.Context, cl caller.OrganizationCaller, status, voucherType, restrictedCustomerSlug, cursor string, limit int32) (pagination.Page[catalogue.Voucher], error) {
	if err := cl.Require(listvouchers.RequiredScope); err != nil {
		return pagination.Page[catalogue.Voucher]{}, err
	}
	return v.uc.ListVouchers.Execute(bindOrganization(ctx, cl), status, voucherType, restrictedCustomerSlug, cursor, limit)
}

func (v Vouchers) GetVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) (*catalogue.Voucher, error) {
	if err := cl.Require(getvoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.GetVoucher.Execute(bindOrganization(ctx, cl), voucherID)
}

func (v Vouchers) LookupVoucher(ctx context.Context, cl caller.OrganizationCaller, code string) (*catalogue.Voucher, error) {
	if err := cl.Require(lookupvoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.LookupVoucher.Execute(bindOrganization(ctx, cl), code)
}

func (v Vouchers) UpdateVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID, draft catalogue.VoucherDraft) (*catalogue.Voucher, error) {
	if err := cl.Require(updatevoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.UpdateVoucher.Execute(bindOrganization(ctx, cl), voucherID, draft)
}

func (v Vouchers) PublishVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) (*catalogue.Voucher, error) {
	if err := cl.Require(publishvoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.PublishVoucher.Execute(bindOrganization(ctx, cl), voucherID)
}

func (v Vouchers) ArchiveVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) (*catalogue.Voucher, error) {
	if err := cl.Require(archivevoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.ArchiveVoucher.Execute(bindOrganization(ctx, cl), voucherID)
}

func (v Vouchers) ListVoucherRedemptions(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID, cursor string, limit int32) (pagination.Page[catalogue.Redemption], error) {
	if err := cl.Require(listvoucherredemptions.RequiredScope); err != nil {
		return pagination.Page[catalogue.Redemption]{}, err
	}
	return v.uc.ListVoucherRedemptions.Execute(bindOrganization(ctx, cl), voucherID, cursor, limit)
}

func (v Vouchers) ValidateVoucher(ctx context.Context, cl caller.OrganizationCaller, command validatevoucher.VoucherCheck) (*validatevoucher.Validity, error) {
	if err := cl.Require(validatevoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.ValidateVoucher.Execute(bindOrganization(ctx, cl), command)
}

func (v Vouchers) RedeemVoucher(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, code string) (*catalogue.Redemption, error) {
	if err := cl.Require(redeemvoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.RedeemVoucher.Execute(bindOrganization(ctx, cl), instanceSlug, code)
}

func (v Vouchers) ListInstanceVouchers(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, status string) ([]catalogue.Redemption, error) {
	if err := cl.Require(listinstancevouchers.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.ListInstanceVouchers.Execute(bindOrganization(ctx, cl), instanceSlug, status)
}

func (v Vouchers) RevokeInstanceVoucher(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, instanceVoucherID uuid.UUID, reason string) (*catalogue.Redemption, error) {
	if err := cl.Require(revokeinstancevoucher.RequiredScope); err != nil {
		return nil, err
	}
	return v.uc.RevokeInstanceVoucher.Execute(bindOrganization(ctx, cl), instanceSlug, instanceVoucherID, reason)
}
