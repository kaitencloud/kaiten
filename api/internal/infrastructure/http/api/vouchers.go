package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
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
)

// registerVouchers publishes the voucher module's operations and the webhook
// contracts its writes emit.
func registerVouchers(core huma.API, app kaiten.Vouchers) {
	createvoucher.RegisterEndpoint(core, app)
	listvouchers.RegisterEndpoint(core, app)
	getvoucher.RegisterEndpoint(core, app)
	lookupvoucher.RegisterEndpoint(core, app)
	updatevoucher.RegisterEndpoint(core, app)
	publishvoucher.RegisterEndpoint(core, app)
	archivevoucher.RegisterEndpoint(core, app)
	listvoucherredemptions.RegisterEndpoint(core, app)
	validatevoucher.RegisterEndpoint(core, app)
	redeemvoucher.RegisterEndpoint(core, app)
	listinstancevouchers.RegisterEndpoint(core, app)
	revokeinstancevoucher.RegisterEndpoint(core, app)
	catalogue.RegisterWebhooks(core)
}
