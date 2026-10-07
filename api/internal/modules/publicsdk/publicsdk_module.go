// Package publicsdk is the public SDK surface: the publishable keys (pk_) a
// vendor's web pages authenticate with, and what those keys may read -- the
// public catalogue, GET /api/public/catalog, and nothing else (§14, D-49).
//
// Customer sessions (kst_) and the session routes of §14.4 are not built yet;
// they belong here too when they are.
package publicsdk

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createpublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listpublishablekeys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokepublishablekey"
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
}

func NewUseCases(svc services.Container) *UseCases {
	deps := keys.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof}
	return &UseCases{
		CreatePublishableKey:       createpublishablekey.NewUseCase(deps),
		ListPublishableKeys:        listpublishablekeys.NewUseCase(deps),
		UpdatePublishableKey:       updatepublishablekey.NewUseCase(deps),
		RevokePublishableKey:       revokepublishablekey.NewUseCase(deps),
		AuthenticatePublishableKey: authenticatepublishablekey.NewUseCase(deps),
		GetPublicCatalog: getpubliccatalog.NewUseCase(getpubliccatalog.Deps{
			Uof:       svc.Uof,
			Gate:      gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
			Providers: svc.BillingProviders,
		}),
	}
}
