package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ackhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelplanchange"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/claimhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closebillingperiods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/detachpaymentmethod"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/exportinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillinghealth"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getcustomerbilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getupcominginvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinstanceinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoicelinereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/markinvoicepaid"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providerconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/reactivatesubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/recomposeinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/releaseinvoicehold"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/retryinvoicepush"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/scheduleplanchange"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncprovider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updateinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/voidinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/writeoffinvoice"
)

// registerBilling publishes the billing module's operations and the webhook
// contracts its writes emit. Each operation receives the facade's billing
// surface as its own one-method interface.
func registerBilling(core, platform huma.API, app kaiten.Billing, platformApp kaiten.Platform) {
	getbillingcapabilities.RegisterEndpoint(core, app)
	getbillinghealth.RegisterEndpoint(core, app)
	syncprovider.RegisterEndpoint(core, app)
	syncinvoice.RegisterEndpoint(core, app)
	getcustomerbilling.RegisterEndpoint(core, app)
	createpaymentmethodsession.RegisterEndpoint(core, app)
	completepaymentmethodsession.RegisterEndpoint(core, app)
	createportalsession.RegisterEndpoint(core, app)
	detachpaymentmethod.RegisterEndpoint(core, app)
	paymentmethods.RegisterWebhooks(core)
	retryinvoicepush.RegisterEndpoint(core, app)
	syncing.RegisterWebhooks(core)
	providerconnector.RegisterWebhooks(core)
	getbillingsettings.RegisterEndpoint(core, app)
	updatebillingsettings.RegisterEndpoint(core, app)
	subscribeinstance.RegisterEndpoint(core, app)
	subscribeinstance.RegisterWebhook(core)
	getinstancebilling.RegisterEndpoint(core, app)
	updateinstancebilling.RegisterEndpoint(core, app)
	cancelsubscription.RegisterEndpoint(core, app)
	reactivatesubscription.RegisterEndpoint(core, app)
	scheduleplanchange.RegisterEndpoint(core, app)
	cancelplanchange.RegisterEndpoint(core, app)
	subscriptions.RegisterWebhooks(core)
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
