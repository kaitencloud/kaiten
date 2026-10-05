package instances

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	auditdb "github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listforinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/deleteinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/deleteintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getaudittrails"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementsusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstances"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/patchinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
)

type UseCases struct {
	CreateIntegration            *createintegrations.UseCase
	CreateInstance               *createinstance.UseCase
	DeleteIntegration            *deleteintegrations.UseCase
	DeleteInstance               *deleteinstance.UseCase
	GetInstance                  *getinstance.UseCase
	GetIntegration               *getintegrations.UseCase
	GetInstances                 *getinstances.UseCase
	PatchInstance                *patchinstance.UseCase
	UpdateInstance               *updateinstance.UseCase
	UpdateIntegration            *updateintegrations.UseCase
	ReportEntitlementUsageMetric *reportentitlementusagemetric.UseCase
	GetEntitlementUsageMetrics   *getentitlementusagemetrics.UseCase
	GetEntitlementsUsageMetrics  *getentitlementsusagemetrics.UseCase
	GetAuditTrails               *getaudittrails.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	auditTrailPort := listforinstance.NewUseCase(auditdb.New(svc.Pool))
	return &UseCases{
		CreateIntegration: createintegrations.NewUseCase(createintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		CreateInstance: createinstance.NewUseCase(createinstance.Deps{
			UserProvider:         svc.UserProvider,
			UsageReporter:        svc.UsageReporter,
			Uof:                  svc.Uof,
			MetadataFieldsLister: validator.NewLister(svc.Pool),
		}),
		DeleteIntegration: deleteintegrations.NewUseCase(deleteintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		DeleteInstance: deleteinstance.NewUseCase(deleteinstance.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetInstance: getinstance.NewUseCase(getinstance.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetIntegration: getintegrations.NewUseCase(getintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetInstances: getinstances.NewUseCase(getinstances.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		PatchInstance: patchinstance.NewUseCase(patchinstance.Deps{
			UserProvider: svc.UserProvider,
			Uof:          svc.Uof,
		}),
		UpdateInstance: updateinstance.NewUseCase(updateinstance.Deps{
			UserProvider:         svc.UserProvider,
			Uof:                  svc.Uof,
			UsageReporter:        svc.UsageReporter,
			MetadataFieldsLister: validator.NewLister(svc.Pool),
		}),
		UpdateIntegration: updateintegrations.NewUseCase(updateintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		ReportEntitlementUsageMetric: reportentitlementusagemetric.NewUseCase(reportentitlementusagemetric.Deps{
			UserProvider:        svc.UserProvider,
			UsageReporter:       svc.UsageReporter,
			Uof:                 svc.Uof,
			MaxRolloverClosures: svc.Config.Usage.RolloverMaxClosures,
			IdempotencyWindow:   svc.Config.Usage.IdempotencyWindow,
		}),
		GetEntitlementUsageMetrics: getentitlementusagemetrics.NewUseCase(getentitlementusagemetrics.Deps{
			UserProvider:     svc.UserProvider,
			Queries:          queries,
			UsageReporter:    svc.UsageReporter,
			OutboxRepository: outbox.NewOutboxRepository(outboxdb.New(svc.Pool)),
		}),
		GetEntitlementsUsageMetrics: getentitlementsusagemetrics.NewUseCase(getentitlementsusagemetrics.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetAuditTrails: getaudittrails.NewUseCase(getaudittrails.Deps{
			UserProvider:   svc.UserProvider,
			AuditTrailPort: auditTrailPort,
		}),
	}
}
