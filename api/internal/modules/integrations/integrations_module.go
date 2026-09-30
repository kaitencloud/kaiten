package integrations

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerintegrationsync "github.com/kaitencloud/kaiten/api/internal/modules/customers/integrationsync"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/updatecustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceintegrationsync "github.com/kaitencloud/kaiten/api/internal/modules/instances/integrationsync"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/updateinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/getintegration"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
)

type UseCases struct {
	GetIntegration    *getintegration.UseCase
	UpsertIntegration *upsertintegration.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	return &UseCases{
		GetIntegration: getintegration.NewUseCase(getintegration.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Customers:     customerintegrationsync.New(svc.Pool),
			Instances:     instanceintegrationsync.New(svc.Pool),
		}),
		// upsertintegration composes these modules' own public use cases --
		// the same ones customers_module.go/instances_module.go wire up for
		// their own HTTP endpoints -- into its own transaction (see
		// uow.Transact's doc comment). Constructing private instances here,
		// rather than sharing customersMod.CreateCustomer etc., mirrors the
		// established pattern for this kind of composition (see
		// createdeploymentzone constructing createdeployment.NewService
		// inline): no module threads its UseCases into another's wiring.
		UpsertIntegration: upsertintegration.NewUseCase(upsertintegration.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uow:           svc.Uof,
			CustomerCreator: createcustomer.NewUseCase(createcustomer.Deps{
				UserProvider:  svc.UserProvider,
				UsageReporter: svc.UsageReporter,
				Uof:           svc.Uof,
			}),
			CustomerUpdater: updatecustomer.NewUseCase(updatecustomer.Deps{
				UserProvider:  svc.UserProvider,
				Uof:           svc.Uof,
				UsageReporter: svc.UsageReporter,
			}),
			InstanceCreator: createinstance.NewUseCase(createinstance.Deps{
				UserProvider:         svc.UserProvider,
				UsageReporter:        svc.UsageReporter,
				Uof:                  svc.Uof,
				MetadataFieldsLister: validator.NewLister(svc.Pool),
			}),
			InstanceUpdater: updateinstance.NewUseCase(updateinstance.Deps{
				UserProvider:         svc.UserProvider,
				Uof:                  svc.Uof,
				UsageReporter:        svc.UsageReporter,
				MetadataFieldsLister: validator.NewLister(svc.Pool),
			}),
		}),
	}
}
