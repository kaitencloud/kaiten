package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createpublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listpublishablekeys"
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
}
