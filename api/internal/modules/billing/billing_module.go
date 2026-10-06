// Package billing is subscriptions and the invoices they produce: what an
// organization's customers owe it, composed from the licence prices and the
// usage journal.
package billing

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
)

type UseCases struct {
	GetBillingSettings    *getbillingsettings.UseCase
	UpdateBillingSettings *updatebillingsettings.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	deps := access.Deps{
		UserProvider: svc.UserProvider,
		Uof:          svc.Uof,
		Gate:         gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
	}
	return &UseCases{
		GetBillingSettings:    getbillingsettings.NewUseCase(deps),
		UpdateBillingSettings: updatebillingsettings.NewUseCase(deps),
	}
}
