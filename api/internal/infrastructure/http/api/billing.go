package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
)

// registerBilling publishes the billing module's operations. Each receives the
// facade's billing surface as its own one-method interface.
func registerBilling(core huma.API, app kaiten.Billing) {
	getbillingsettings.RegisterEndpoint(core, app)
	updatebillingsettings.RegisterEndpoint(core, app)
}
