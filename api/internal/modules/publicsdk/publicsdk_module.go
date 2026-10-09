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
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatecustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/cancelsessionsubscription"
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
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/reactivatesessionsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokecustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/updatepublishablekey"
)

// UseCases contains all the use case handlers for the public SDK module.
type UseCases struct {
	CreatePublishableKey *createpublishablekey.UseCase
	ListPublishableKeys  *listpublishablekeys.UseCase
	UpdatePublishableKey *updatepublishablekey.UseCase
	RevokePublishableKey *revokepublishablekey.UseCase

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

	CreateSessionCheckout *createsessioncheckout.UseCase
	ListSessionInvoices   *listsessioninvoices.UseCase

	CreateSessionPaymentMethodSession   *createsessionpaymentmethodsession.UseCase
	CompleteSessionPaymentMethodSession *completesessionpaymentmethodsession.UseCase
	CreateSessionPortalSession          *createsessionportalsession.UseCase

	CancelSessionSubscription     *cancelsessionsubscription.UseCase
	ReactivateSessionSubscription *reactivatesessionsubscription.UseCase
}

// Ports are the other modules' operations the session routes run: a checkout
// is a subscribe made on a customer's behalf, and what a session lists is
// billing's invoices. The modules that own them implement them.
type Ports struct {
	Subscriber      createsessioncheckout.Subscriber
	CustomerBilling createsessioncheckout.CustomerBillingReader
	OpenSetup       createsessioncheckout.SetupSessionOpener
	CompleteSetup   createsessioncheckout.SetupSessionCompleter
	Invoices        createsessioncheckout.InvoiceReader
	BillingEmails   createsessioncheckout.BillingEmailSetter
	SessionInvoices listsessioninvoices.Invoices
	OpenPortal      createsessionportalsession.Opener
	Cancel          cancelsessionsubscription.Canceler
	Reactivate      reactivatesessionsubscription.Reactivator
}

func NewUseCases(svc services.Container, from Ports) *UseCases {
	deps := keys.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof}
	catalog := getpubliccatalog.NewUseCase(getpubliccatalog.Deps{
		Uof:       svc.Uof,
		Gate:      gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
		Providers: svc.BillingProviders,
	})
	sessionDeps := sessions.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof}
	return &UseCases{
		CreateCustomerSession:       createcustomersession.NewUseCase(sessionDeps),
		RevokeCustomerSession:       revokecustomersession.NewUseCase(sessionDeps),
		AuthenticateCustomerSession: authenticatecustomersession.NewUseCase(sessionDeps),
		CreatePublishableKey:        createpublishablekey.NewUseCase(deps),
		ListPublishableKeys:         listpublishablekeys.NewUseCase(deps),
		UpdatePublishableKey:        updatepublishablekey.NewUseCase(deps),
		RevokePublishableKey:        revokepublishablekey.NewUseCase(deps),
		AuthenticatePublishableKey:  authenticatepublishablekey.NewUseCase(deps),
		GetPublicCatalog:            catalog,
		CreateSessionCheckout: createsessioncheckout.NewUseCase(createsessioncheckout.Deps{
			UserProvider: svc.UserProvider, Catalog: catalog, Subscriber: from.Subscriber,
			CustomerBilling: from.CustomerBilling, OpenSetup: from.OpenSetup, CompleteSetup: from.CompleteSetup,
			Invoices: from.Invoices, BillingEmails: from.BillingEmails,
		}),
		ListSessionInvoices: listsessioninvoices.NewUseCase(from.SessionInvoices),

		CreateSessionPaymentMethodSession:   createsessionpaymentmethodsession.NewUseCase(from.OpenSetup),
		CompleteSessionPaymentMethodSession: completesessionpaymentmethodsession.NewUseCase(from.CompleteSetup),
		CreateSessionPortalSession:          createsessionportalsession.NewUseCase(from.OpenPortal),

		CancelSessionSubscription:     cancelsessionsubscription.NewUseCase(from.Cancel),
		ReactivateSessionSubscription: reactivatesessionsubscription.NewUseCase(from.Reactivate),
	}
}
