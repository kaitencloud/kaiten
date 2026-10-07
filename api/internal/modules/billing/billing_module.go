// Package billing is subscriptions and the invoices they produce: what an
// organization's customers owe it, composed from the licence prices and the
// usage journal.
package billing

import (
	"context"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/detachpaymentmethod"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getcustomerbilling"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ackhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelplanchange"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/claimhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closebillingperiods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/exportinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillinghealth"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getupcominginvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinstanceinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoicelinereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/markinvoicepaid"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/pushing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/reactivatesubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/recomposeinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/releaseinvoicehold"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/retryinvoicepush"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/scheduleplanchange"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncprovider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updateinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/voidinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/writeoffinvoice"
)

// Ports is what billing reads from other modules, implemented by them.
type Ports struct {
	Catalogue ports.CatalogueSource
	Usage     ports.UsageSource
	Addons    ports.AddonSource
	Discounts ports.DiscountSource
}

type UseCases struct {
	GetBillingSettings     *getbillingsettings.UseCase
	UpdateBillingSettings  *updatebillingsettings.UseCase
	SubscribeInstance      *subscribeinstance.UseCase
	GetInstanceBilling     *getinstancebilling.UseCase
	CloseBillingPeriods    *closebillingperiods.UseCase
	ListInvoices           *listinvoices.UseCase
	ListInstanceInvoices   *listinstanceinvoices.UseCase
	GetInvoice             *getinvoice.UseCase
	GetUpcomingInvoice     *getupcominginvoice.UseCase
	MarkInvoicePaid        *markinvoicepaid.UseCase
	WriteOffInvoice        *writeoffinvoice.UseCase
	VoidInvoice            *voidinvoice.UseCase
	ReleaseInvoiceHold     *releaseinvoicehold.UseCase
	RecomposeInvoice       *recomposeinvoice.UseCase
	ListHandoff            *listhandoff.UseCase
	ClaimHandoff           *claimhandoff.UseCase
	AckHandoff             *ackhandoff.UseCase
	ExportInvoices         *exportinvoices.UseCase
	ListInvoiceLineReports *listinvoicelinereports.UseCase
	GetBillingCapabilities *getbillingcapabilities.UseCase
	CancelSubscription     *cancelsubscription.UseCase
	ReactivateSubscription *reactivatesubscription.UseCase
	SchedulePlanChange     *scheduleplanchange.UseCase
	CancelPlanChange       *cancelplanchange.UseCase
	UpdateInstanceBilling  *updateinstancebilling.UseCase
	RetryInvoicePush       *retryinvoicepush.UseCase
	SyncProvider           *syncprovider.UseCase
	SyncInvoice            *syncinvoice.UseCase
	GetBillingHealth       *getbillinghealth.UseCase

	GetCustomerBilling           *getcustomerbilling.UseCase
	CreatePaymentMethodSession   *createpaymentmethodsession.UseCase
	CompletePaymentMethodSession *completepaymentmethodsession.UseCase
	CreatePortalSession          *createportalsession.UseCase
	DetachPaymentMethod          *detachpaymentmethod.UseCase
}

func NewUseCases(svc services.Container, from Ports) *UseCases {
	deps := access.Deps{
		UserProvider:    svc.UserProvider,
		Uof:             svc.Uof,
		Gate:            gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
		Catalogue:       from.Catalogue,
		Usage:           from.Usage,
		Addons:          from.Addons,
		Discounts:       from.Discounts,
		Providers:       svc.BillingProviders,
		ProviderTimeout: svc.Config.Billing.ProviderTimeout,

		AutoCollectionGrace: svc.Config.Billing.AutoCollectionGrace,
	}
	cfg := svc.Config.Billing
	closer := closing.New(deps, cfg.CloseGrace)
	pusher := pushing.New(deps, pushing.Config{
		MaxBackoff: cfg.Push.MaxBackoff, AlertAfterAttempts: cfg.Push.AlertAfterAttempts,
		Timeout: cfg.ProviderTimeout, BatchSize: cfg.Push.BatchSize,
	})
	syncer := syncing.New(deps, cfg.ProviderTimeout)
	useCases := &UseCases{
		GetBillingSettings:     getbillingsettings.NewUseCase(deps),
		UpdateBillingSettings:  updatebillingsettings.NewUseCase(deps),
		SubscribeInstance:      subscribeinstance.NewUseCase(deps),
		GetInstanceBilling:     getinstancebilling.NewUseCase(deps),
		CloseBillingPeriods:    closebillingperiods.NewUseCase(deps, closer, batchSize(cfg.PeriodClose.BatchSize)),
		ListInvoices:           listinvoices.NewUseCase(deps),
		ListInstanceInvoices:   listinstanceinvoices.NewUseCase(deps),
		GetInvoice:             getinvoice.NewUseCase(deps),
		GetUpcomingInvoice:     getupcominginvoice.NewUseCase(deps, closer),
		MarkInvoicePaid:        markinvoicepaid.NewUseCase(deps),
		WriteOffInvoice:        writeoffinvoice.NewUseCase(deps),
		VoidInvoice:            voidinvoice.NewUseCase(deps),
		ReleaseInvoiceHold:     releaseinvoicehold.NewUseCase(deps, closer),
		RecomposeInvoice:       recomposeinvoice.NewUseCase(deps, closer),
		ListHandoff:            listhandoff.NewUseCase(deps),
		ClaimHandoff:           claimhandoff.NewUseCase(deps),
		AckHandoff:             ackhandoff.NewUseCase(deps),
		ExportInvoices:         exportinvoices.NewUseCase(deps),
		ListInvoiceLineReports: listinvoicelinereports.NewUseCase(deps),
		GetBillingCapabilities: getbillingcapabilities.NewUseCase(deps, svc.Config.Usage.IdempotencyWindow),
		CancelSubscription:     cancelsubscription.NewUseCase(deps, closer),
		ReactivateSubscription: reactivatesubscription.NewUseCase(deps),
		SchedulePlanChange:     scheduleplanchange.NewUseCase(deps),
		CancelPlanChange:       cancelplanchange.NewUseCase(deps),
		UpdateInstanceBilling:  updateinstancebilling.NewUseCase(deps),
		RetryInvoicePush:       retryinvoicepush.NewUseCase(deps, pusher),
		SyncProvider:           syncprovider.NewUseCase(deps, syncer),
		SyncInvoice:            syncinvoice.NewUseCase(deps, syncer),
		GetBillingHealth:       getbillinghealth.NewUseCase(deps, cfg.Push.AlertAfterAttempts),

		GetCustomerBilling:           getcustomerbilling.NewUseCase(deps),
		CreatePaymentMethodSession:   createpaymentmethodsession.NewUseCase(deps),
		CompletePaymentMethodSession: completepaymentmethodsession.NewUseCase(deps),
		CreatePortalSession:          createportalsession.NewUseCase(deps),
		DetachPaymentMethod:          detachpaymentmethod.NewUseCase(deps),
	}

	// The billing jobs run only where billing is on and background work runs.
	if cfg.Enabled && svc.BackgroundWorkers && svc.Pool != nil {
		job := closing.NewJob(svc.Pool, closer, sweep.Config{
			InitialDelay: orDefault(cfg.InitialDelay, time.Minute),
			Interval:     orDefault(cfg.PeriodClose.Interval, 5*time.Minute),
		}, batchSize(cfg.PeriodClose.BatchSize))
		job.Start(context.Background())
		svc.WorkerRegistry.OnStop(job.Stop)

		overdue := lifecycle.NewJob(svc.Pool, lifecycle.NewOverdue(svc.Uof, cfg.AutoCollectionGrace), sweep.Config{
			InitialDelay: orDefault(cfg.InitialDelay, time.Minute),
			Interval:     orDefault(cfg.Lifecycle.Interval, 15*time.Minute),
		}, batchSize(cfg.PeriodClose.BatchSize), paymentmethods.NewExpiry(svc.Uof))
		overdue.Start(context.Background())
		svc.WorkerRegistry.OnStop(overdue.Stop)

		push := pushing.NewJob(svc.Pool, pusher, sweep.Config{
			InitialDelay: orDefault(cfg.InitialDelay, time.Minute),
			Interval:     orDefault(cfg.Push.Interval, time.Minute),
		})
		push.Start(context.Background())
		svc.WorkerRegistry.OnStop(push.Stop)

		sync := syncing.NewJob(svc.Pool, syncer, sweep.Config{
			InitialDelay: orDefault(cfg.InitialDelay, time.Minute),
			Interval:     orDefault(cfg.Sync.Interval, 15*time.Minute),
		})
		sync.Start(context.Background())
		svc.WorkerRegistry.OnStop(sync.Stop)
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
