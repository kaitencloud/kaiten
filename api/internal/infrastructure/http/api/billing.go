package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ackhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/claimhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closebillingperiods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/exportinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getupcominginvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinstanceinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoicelinereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/markinvoicepaid"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/recomposeinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/releaseinvoicehold"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/voidinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/writeoffinvoice"
)

// registerBilling publishes the billing module's operations and the webhook
// contracts its writes emit. Each operation receives the facade's billing
// surface as its own one-method interface.
func registerBilling(core, platform huma.API, app kaiten.Billing, platformApp kaiten.Platform) {
	getbillingsettings.RegisterEndpoint(core, app)
	updatebillingsettings.RegisterEndpoint(core, app)
	subscribeinstance.RegisterEndpoint(core, app)
	subscribeinstance.RegisterWebhook(core)
	getinstancebilling.RegisterEndpoint(core, app)
	getupcominginvoice.RegisterEndpoint(core, app)
	listinvoices.RegisterEndpoint(core, app)
	listinstanceinvoices.RegisterEndpoint(core, app)
	// The export's static path before the invoice's {invoiceId}.
	exportinvoices.RegisterEndpoint(core, app)
	getinvoice.RegisterEndpoint(core, app)
	listinvoicelinereports.RegisterEndpoint(core, app)
	markinvoicepaid.RegisterEndpoint(core, app)
	writeoffinvoice.RegisterEndpoint(core, app)
	voidinvoice.RegisterEndpoint(core, app)
	releaseinvoicehold.RegisterEndpoint(core, app)
	recomposeinvoice.RegisterEndpoint(core, app)
	listhandoff.RegisterEndpoint(core, app)
	claimhandoff.RegisterEndpoint(core, app)
	ackhandoff.RegisterEndpoint(core, app)
	closebillingperiods.RegisterEndpoint(core, app)
	closebillingperiods.RegisterPlatformEndpoint(platform, platformApp)
	invoices.RegisterWebhooks(core)
}
