// Package vouchers is the voucher module: the voucher catalogue and the
// vouchers instances redeem.
package vouchers

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/archivevoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/createvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/expiry"
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
)

type UseCases struct {
	CreateVoucher          *createvoucher.UseCase
	ListVouchers           *listvouchers.UseCase
	GetVoucher             *getvoucher.UseCase
	LookupVoucher          *lookupvoucher.UseCase
	UpdateVoucher          *updatevoucher.UseCase
	PublishVoucher         *publishvoucher.UseCase
	ArchiveVoucher         *archivevoucher.UseCase
	ListVoucherRedemptions *listvoucherredemptions.UseCase
	ValidateVoucher        *validatevoucher.UseCase
	RedeemVoucher          *redeemvoucher.UseCase
	ListInstanceVouchers   *listinstancevouchers.UseCase
	RevokeInstanceVoucher  *revokeinstancevoucher.UseCase
	// Expiry is the bookkeeping the billing-lifecycle job runs.
	Expiry *expiry.Expiry
}

func NewUseCases(svc services.Container) *UseCases {
	deps := catalogue.Deps{
		UserProvider: svc.UserProvider,
		Uof:          svc.Uof,
		Gate:         gate.NewCached(svc.Config.Billing.Enabled, svc.ConnectorEntitlements, svc.Config.Billing.EntitlementCacheTTL),
	}
	return &UseCases{
		CreateVoucher:          createvoucher.NewUseCase(deps),
		ListVouchers:           listvouchers.NewUseCase(deps),
		GetVoucher:             getvoucher.NewUseCase(deps),
		LookupVoucher:          lookupvoucher.NewUseCase(deps),
		UpdateVoucher:          updatevoucher.NewUseCase(deps),
		PublishVoucher:         publishvoucher.NewUseCase(deps),
		ArchiveVoucher:         archivevoucher.NewUseCase(deps),
		ListVoucherRedemptions: listvoucherredemptions.NewUseCase(deps),
		ValidateVoucher:        validatevoucher.NewUseCase(deps),
		RedeemVoucher:          redeemvoucher.NewUseCase(deps),
		ListInstanceVouchers:   listinstancevouchers.NewUseCase(deps),
		RevokeInstanceVoucher:  revokeinstancevoucher.NewUseCase(deps),
		Expiry:                 expiry.New(svc.Uof),
	}
}
