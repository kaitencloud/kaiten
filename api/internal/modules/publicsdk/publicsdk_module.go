// Package publicsdk is the public SDK surface: the publishable keys (pk_) a
// vendor's web pages authenticate with, and what those keys may read -- the
// public catalogue, GET /api/public/catalog, and nothing else (§14, D-49).
//
// It also holds the customer sessions (kst_) a vendor's backend mints for its
// customers' browsers, and what those may do on /api/public/session.
package publicsdk

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/turnstile"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatecheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatecustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/cancelsessionsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/completesessionpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/confirmcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createpublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessioncheckout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessionpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessionportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getcheckoutsessionadmin"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getsessionportal"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listcheckoutsessions"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listpublishablekeys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listsessioninvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/reactivatesessionsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/redeemsessionvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokecustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/setsessionaddonquantity"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/updatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/validatesessionvoucher"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// UseCases contains all the use case handlers for the public SDK module.
type UseCases struct {
	CreatePublishableKey *createpublishablekey.UseCase
	ListPublishableKeys  *listpublishablekeys.UseCase
	// The vendor's reads of its anonymous checkouts (§13.18).
	ListCheckoutSessions    *listcheckoutsessions.UseCase
	GetCheckoutSessionAdmin *getcheckoutsessionadmin.UseCase
	UpdatePublishableKey    *updatepublishablekey.UseCase
	RevokePublishableKey    *revokepublishablekey.UseCase

	// AuthenticatePublishableKey backs auth.PublishableKeyMiddleware and appears
	// on no surface of its own: authentication precedes a caller, so it cannot go
	// through the facade -- the exception identity's ValidateToken also is.
	AuthenticatePublishableKey *authenticatepublishablekey.UseCase

	GetPublicCatalog *getpubliccatalog.UseCase

	CreateCustomerSession *createcustomersession.UseCase
	RevokeCustomerSession *revokecustomersession.UseCase
	// AuthenticateCustomerSession backs the same authenticator, for the session
	// routes; on no surface of its own, for the same reason.
	AuthenticateCustomerSession *authenticatecustomersession.UseCase
	// AuthenticateCheckoutSession resolves a ksc_ for the same authenticator,
	// on one checkout session's routes (V32-01).
	AuthenticateCheckoutSession *authenticatecheckoutsession.UseCase

	CreateSessionCheckout  *createsessioncheckout.UseCase
	CreateCheckoutSession  *createcheckoutsession.UseCase
	GetCheckoutSession     *getcheckoutsession.UseCase
	ConfirmCheckoutSession *confirmcheckoutsession.UseCase
	ListSessionInvoices    *listsessioninvoices.UseCase

	CreateSessionPaymentMethodSession   *createsessionpaymentmethodsession.UseCase
	CompleteSessionPaymentMethodSession *completesessionpaymentmethodsession.UseCase
	CreateSessionPortalSession          *createsessionportalsession.UseCase

	CancelSessionSubscription     *cancelsessionsubscription.UseCase
	ReactivateSessionSubscription *reactivatesessionsubscription.UseCase
	ValidateSessionVoucher        *validatesessionvoucher.UseCase
	RedeemSessionVoucher          *redeemsessionvoucher.UseCase
	SetSessionAddonQuantity       *setsessionaddonquantity.UseCase
	GetSessionPortal              *getsessionportal.UseCase
}

// Ports are the other modules' operations the session routes run: a checkout
// is a subscribe made on a customer's behalf, and what a session lists is
// billing's invoices. The modules that own them implement them.
type Ports struct {
	Subscriber createsessioncheckout.Subscriber
	Activation createcheckoutsession.Activation
	// The completion of an anonymous checkout creates a customer and an
	// instance, then subscribes it (§9.12).
	CheckoutCustomers  confirmcheckoutsession.CustomerCreator
	CheckoutInstances  confirmcheckoutsession.InstanceCreator
	CheckoutSubscriber confirmcheckoutsession.Subscriber
	CheckoutSetup      confirmcheckoutsession.Setup
	CustomerBilling    createsessioncheckout.CustomerBillingReader
	OpenSetup          createsessioncheckout.SetupSessionOpener
	CompleteSetup      createsessioncheckout.SetupSessionCompleter
	Invoices           createsessioncheckout.InvoiceReader
	BillingEmails      createsessioncheckout.BillingEmailSetter
	SessionInvoices    listsessioninvoices.Invoices
	OpenPortal         createsessionportalsession.Opener
	Cancel             cancelsessionsubscription.Canceler
	Reactivate         reactivatesessionsubscription.Reactivator
	Vouchers           validatesessionvoucher.Validator
	VoucherLimit       redeemsessionvoucher.Limiter
	SessionRedeemer    redeemsessionvoucher.Redeemer
	AddonList          setsessionaddonquantity.Lister
	AddonAttach        setsessionaddonquantity.Attacher
	AddonQuantity      setsessionaddonquantity.QuantitySetter
	AddonDetach        setsessionaddonquantity.Detacher
	Subscription       getsessionportal.SubscriptionReader
	Checkout           getsessionportal.CheckoutChecker
	UpcomingInvoice    getsessionportal.UpcomingInvoiceReader
	Entitlements       getsessionportal.EntitlementReader
	Redemptions        getsessionportal.VoucherReader
}

func NewUseCases(svc services.Container, from Ports) *UseCases {
	billingGate := gate.NewCached(svc.Config.Billing.Enabled, svc.ConnectorEntitlements, svc.Config.Billing.EntitlementCacheTTL)
	deps := keys.Deps{
		UserProvider: svc.UserProvider, Uof: svc.Uof, Gate: billingGate,
		Secrets: keys.NewVaultSecretStore(svc.Config.Connectors.VaultBasePath),
	}
	catalog := getpubliccatalog.NewUseCase(getpubliccatalog.Deps{
		Uof:       svc.Uof,
		Gate:      billingGate,
		Providers: svc.BillingProviders,
		Branding:  gate.NewFeature(svc.ConnectorEntitlements, dogfooding.RemovePoweredByEntitlementSlug, svc.Config.Billing.EntitlementCacheTTL),
	})
	sessionDeps := sessions.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof, Gate: billingGate}
	return &UseCases{
		CreateCustomerSession:       createcustomersession.NewUseCase(sessionDeps),
		RevokeCustomerSession:       revokecustomersession.NewUseCase(sessionDeps),
		AuthenticateCustomerSession: authenticatecustomersession.NewUseCase(sessionDeps),
		AuthenticateCheckoutSession: authenticatecheckoutsession.NewUseCase(authenticatecheckoutsession.Deps{Uof: svc.Uof}),
		CreatePublishableKey:        createpublishablekey.NewUseCase(deps),
		ListPublishableKeys:         listpublishablekeys.NewUseCase(deps),
		ListCheckoutSessions:        listcheckoutsessions.NewUseCase(deps, from.Activation),
		GetCheckoutSessionAdmin:     getcheckoutsessionadmin.NewUseCase(deps, from.Activation),
		UpdatePublishableKey:        updatepublishablekey.NewUseCase(deps),
		RevokePublishableKey:        revokepublishablekey.NewUseCase(deps),
		AuthenticatePublishableKey:  authenticatepublishablekey.NewUseCase(deps),
		GetPublicCatalog:            catalog,
		CreateSessionCheckout: createsessioncheckout.NewUseCase(createsessioncheckout.Deps{
			UserProvider: svc.UserProvider, Catalog: catalog, Subscriber: from.Subscriber,
			CustomerBilling: from.CustomerBilling, OpenSetup: from.OpenSetup, CompleteSetup: from.CompleteSetup,
			Invoices: from.Invoices, BillingEmails: from.BillingEmails,
		}),
		CreateCheckoutSession: createcheckoutsession.NewUseCase(createcheckoutsession.Deps{
			Uof: svc.Uof, Catalog: catalog, Activation: from.Activation, Secrets: deps.Secrets,
			Turnstile: turnstile.NewClient(svc.TurnstileVerifyURL),
		}),
		GetCheckoutSession: getcheckoutsession.NewUseCase(getcheckoutsession.Deps{Uof: svc.Uof, Activation: from.Activation, Payments: from.CheckoutSetup}),
		ConfirmCheckoutSession: confirmcheckoutsession.NewUseCase(confirmcheckoutsession.Deps{
			UserProvider: svc.UserProvider, Uof: svc.Uof, Catalog: catalog, Activation: from.Activation,
			Customers: from.CheckoutCustomers, Instances: from.CheckoutInstances, Subscriber: from.CheckoutSubscriber,
			Setup: from.CheckoutSetup, UsageReporter: svc.UsageReporter,
		}),
		ListSessionInvoices: listsessioninvoices.NewUseCase(from.SessionInvoices),

		CreateSessionPaymentMethodSession:   createsessionpaymentmethodsession.NewUseCase(from.OpenSetup),
		CompleteSessionPaymentMethodSession: completesessionpaymentmethodsession.NewUseCase(from.CompleteSetup),
		CreateSessionPortalSession:          createsessionportalsession.NewUseCase(from.OpenPortal),

		CancelSessionSubscription:     cancelsessionsubscription.NewUseCase(from.Cancel),
		ReactivateSessionSubscription: reactivatesessionsubscription.NewUseCase(from.Reactivate),
		ValidateSessionVoucher:        validatesessionvoucher.NewUseCase(from.Vouchers),
		RedeemSessionVoucher:          redeemsessionvoucher.NewUseCase(from.VoucherLimit, from.SessionRedeemer),
		SetSessionAddonQuantity: setsessionaddonquantity.NewUseCase(setsessionaddonquantity.Deps{
			UserProvider: svc.UserProvider, Catalog: catalog,
			List: from.AddonList, Attach: from.AddonAttach, SetQuantity: from.AddonQuantity, Detach: from.AddonDetach,
		}),
		GetSessionPortal: getsessionportal.NewUseCase(getsessionportal.Deps{
			Queries: sessionDeps.Queries, Catalog: catalog, Subscription: from.Subscription, Checkout: from.Checkout, UpcomingInvoice: from.UpcomingInvoice,
			Entitlements: from.Entitlements, AddOns: from.AddonList, Vouchers: from.Redemptions, CustomerBilling: from.CustomerBilling,
		}),
	}
}
