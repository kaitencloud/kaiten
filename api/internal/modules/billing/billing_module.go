// Package billing is subscriptions and the invoices they produce: what an
// organization's customers owe it, composed from the licence prices and the
// usage journal.
package billing

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ackhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/claimhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closebillingperiods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getupcominginvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinstanceinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/markinvoicepaid"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/recomposeinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/releaseinvoicehold"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/voidinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/writeoffinvoice"
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
	CloseBillingPeriods   *closebillingperiods.UseCase
	ListInvoices          *listinvoices.UseCase
	ListInstanceInvoices  *listinstanceinvoices.UseCase
	GetInvoice            *getinvoice.UseCase
	GetUpcomingInvoice    *getupcominginvoice.UseCase
	MarkInvoicePaid       *markinvoicepaid.UseCase
	WriteOffInvoice       *writeoffinvoice.UseCase
	VoidInvoice           *voidinvoice.UseCase
	ReleaseInvoiceHold    *releaseinvoicehold.UseCase
	RecomposeInvoice      *recomposeinvoice.UseCase
	ListHandoff           *listhandoff.UseCase
	ClaimHandoff          *claimhandoff.UseCase
	AckHandoff            *ackhandoff.UseCase
}

func NewUseCases(svc services.Container, from Ports) *UseCases {
	deps := access.Deps{
		UserProvider: svc.UserProvider,
		Uof:          svc.Uof,
		Gate:         gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
		Catalogue:    from.Catalogue,
		Usage:        from.Usage,
	}
	cfg := svc.Config.Billing
	closer := closing.New(deps, cfg.CloseGrace)
	useCases := &UseCases{
		GetBillingSettings:    getbillingsettings.NewUseCase(deps),
		UpdateBillingSettings: updatebillingsettings.NewUseCase(deps),
		SubscribeInstance:     subscribeinstance.NewUseCase(deps),
		GetInstanceBilling:    getinstancebilling.NewUseCase(deps),
		CloseBillingPeriods:   closebillingperiods.NewUseCase(deps, closer, batchSize(cfg.PeriodClose.BatchSize)),
		ListInvoices:          listinvoices.NewUseCase(deps),
		ListInstanceInvoices:  listinstanceinvoices.NewUseCase(deps),
		GetInvoice:            getinvoice.NewUseCase(deps),
		GetUpcomingInvoice:    getupcominginvoice.NewUseCase(deps, closer),
		MarkInvoicePaid:       markinvoicepaid.NewUseCase(deps),
		WriteOffInvoice:       writeoffinvoice.NewUseCase(deps),
		VoidInvoice:           voidinvoice.NewUseCase(deps),
		ReleaseInvoiceHold:    releaseinvoicehold.NewUseCase(deps, closer),
		RecomposeInvoice:      recomposeinvoice.NewUseCase(deps, closer),
		ListHandoff:           listhandoff.NewUseCase(deps),
		ClaimHandoff:          claimhandoff.NewUseCase(deps),
		AckHandoff:            ackhandoff.NewUseCase(deps),
	}

	// The billing jobs run only where billing is on and background work runs.
	if cfg.Enabled && svc.BackgroundWorkers && svc.Pool != nil {
		job := closing.NewJob(svc.Pool, closer, sweep.Config{
			InitialDelay: orDefault(cfg.InitialDelay, time.Minute),
			Interval:     orDefault(cfg.PeriodClose.Interval, 5*time.Minute),
		}, batchSize(cfg.PeriodClose.BatchSize))
		job.Start(context.Background())
		svc.WorkerRegistry.OnStop(job.Stop)
	}
	return useCases
}

// orDefault is a configured duration, or the billing default when it is 0: the
// sweep package's own 12-hour default never applies to a billing job. A
// negative interval disables the job.
func orDefault(configured, fallback time.Duration) time.Duration {
	if configured == 0 {
		return fallback
	}
	return configured
}

// batchSize is the configured batch size, or the default for a configuration
// built without the settings table (tests, the seeder).
func batchSize(configured int) int {
	if configured <= 0 {
		return 100
	}
	return configured
}
