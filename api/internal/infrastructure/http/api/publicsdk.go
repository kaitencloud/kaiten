package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/completesessionpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createpublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessioncheckout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessionpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessionportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listpublishablekeys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listsessioninvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokecustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/updatepublishablekey"
)

// registerPublicSDK publishes the publishable key operations on the Core API
// and the public catalogue under /public, which the publishable key alone
// authenticates.
func registerPublicSDK(core huma.API, app kaiten.PublicSDK) {
	createpublishablekey.RegisterEndpoint(core, app)
	listpublishablekeys.RegisterEndpoint(core, app)
	updatepublishablekey.RegisterEndpoint(core, app)
	revokepublishablekey.RegisterEndpoint(core, app)
	getpubliccatalog.RegisterEndpoint(core, app)
	createcustomersession.RegisterEndpoint(core, app)
	revokecustomersession.RegisterEndpoint(core, app)
	createsessioncheckout.RegisterEndpoint(core, app)
	listsessioninvoices.RegisterEndpoint(core, app)
	createsessionpaymentmethodsession.RegisterEndpoint(core, app)
	completesessionpaymentmethodsession.RegisterEndpoint(core, app)
	createsessionportalsession.RegisterEndpoint(core, app)
	keys.RegisterWebhooks(core)
}
