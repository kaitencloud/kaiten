// Package billing is subscriptions and the invoices they produce: what an
// organization's customers owe it, composed from the licence prices and the
// usage journal.
package billing

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
)

// Ports is what billing reads from other modules, implemented by them.
type Ports struct {
	Catalogue ports.CatalogueSource
	Usage     ports.UsageSource
}

type UseCases struct {
	GetBillingSettings    *getbillingsettings.UseCase
	UpdateBillingSettings *updatebillingsettings.UseCase
	SubscribeInstance     *subscribeinstance.UseCase
	GetInstanceBilling    *getinstancebilling.UseCase
}

func NewUseCases(svc services.Container, from Ports) *UseCases {
	deps := access.Deps{
		UserProvider: svc.UserProvider,
		Uof:          svc.Uof,
		Gate:         gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
		Catalogue:    from.Catalogue,
		Usage:        from.Usage,
	}
	return &UseCases{
		GetBillingSettings:    getbillingsettings.NewUseCase(deps),
		UpdateBillingSettings: updatebillingsettings.NewUseCase(deps),
		SubscribeInstance:     subscribeinstance.NewUseCase(deps),
		GetInstanceBilling:    getinstancebilling.NewUseCase(deps),
	}
}
