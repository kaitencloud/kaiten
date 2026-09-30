package connectors

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activateconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activation"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/deactivateconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/deletesettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnectorstate"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getsettingsschema"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registerconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/updatesettings"
	customercreateintegrations "github.com/kaitencloud/kaiten/api/internal/modules/customers/createintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	customergetintegrations "github.com/kaitencloud/kaiten/api/internal/modules/customers/getintegrations"
	customerdb "github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	customerupdateintegrations "github.com/kaitencloud/kaiten/api/internal/modules/customers/updateintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzone"
	zonedb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	instancecreateintegrations "github.com/kaitencloud/kaiten/api/internal/modules/instances/createintegrations"
	instancegetintegrations "github.com/kaitencloud/kaiten/api/internal/modules/instances/getintegrations"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceupdateintegrations "github.com/kaitencloud/kaiten/api/internal/modules/instances/updateintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	licensedb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
)

// UseCases aggregates all connector settings use cases.
type UseCases struct {
	Register       *registerconnector.UseCase
	GetConnector   *getconnector.UseCase
	GetConnectors  *getconnectors.UseCase
	GetState       *getconnectorstate.UseCase
	Activate       *activateconnector.UseCase
	Deactivate     *deactivateconnector.UseCase
	GetSettings    *getsettings.UseCase
	GetSchema      *getsettingsschema.UseCase
	UpdateSettings *updatesettings.UseCase
	DeleteSettings *deletesettings.UseCase

	// Attio is the built-in CDC consumer that mirrors customers and instances into
	// Attio. It hangs off this module because the connector belongs to it, and it is
	// handed to cdc.NewDispatcher rather than published as an endpoint: nothing calls
	// it except a delivery.
	Attio *attio.Consumer
}

// NewUseCases creates a new UseCases instance with all use cases initialized.
func NewUseCases(svc services.Container) *UseCases {
	// The ambient handle rather than the pool, because this one value serves
	// both the HTTP endpoints below and the Attio consumer at the bottom -- and
	// the consumer runs inside the transaction cdc's dispatcher opened. Bound to
	// the pool it would acquire a second connection to do that, which is the
	// deadlock uow.Ambient's own comment describes. On the HTTP path ctx carries
	// no transaction and Ambient resolves to the pool, so nothing there changes.
	queries := db.New(svc.Uof.Ambient())
	return &UseCases{
		Register:      registerconnector.NewFromContainer(queries),
		GetConnector:  getconnector.NewFromContainer(queries),
		GetConnectors: getconnectors.NewFromContainer(queries),
		GetState: getconnectorstate.NewUseCase(getconnectorstate.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
			Entitlements: svc.ConnectorEntitlements,
		}),
		Activate: activateconnector.NewUseCase(activateconnector.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
			Entitlements: svc.ConnectorEntitlements,
		}),
		Deactivate: deactivateconnector.NewUseCase(deactivateconnector.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetSettings: getsettings.NewUseCase(getsettings.Deps{
			UserProvider:            svc.UserProvider,
			ConnectorsVaultBasePath: svc.Config.Connectors.VaultBasePath,
			Queries:                 queries,
		}),
		GetSchema: getsettingsschema.NewFromContainer(queries),
		UpdateSettings: updatesettings.NewUseCase(updatesettings.Deps{
			UserProvider:            svc.UserProvider,
			ConnectorsVaultBasePath: svc.Config.Connectors.VaultBasePath,
			Queries:                 queries,
			Entitlements:            svc.ConnectorEntitlements,
		}),
		DeleteSettings: deletesettings.NewUseCase(deletesettings.Deps{
			UserProvider:            svc.UserProvider,
			ConnectorsVaultBasePath: svc.Config.Connectors.VaultBasePath,
			Queries:                 queries,
		}),
		Attio: newAttioConsumer(svc, queries),
	}
}

// newAttioConsumer assembles the built-in Attio connector.
//
// It constructs the other modules' own public use cases inline from svc, which is the
// established pattern for cross-module composition here (integrations_module.go does
// the same for upsertintegration, and createdeploymentzone for createdeployment): no
// module threads its UseCases into another module's wiring, so nothing here can depend
// on the order container.go builds modules in.
//
// Going through those use cases rather than the tables is what keeps a connector's
// write indistinguishable from an operator's: the slug resolution, the integration-URL
// validation and the usage tracking all still happen. The connector's own privilege is
// only that it reads the settings store unredacted -- it needs the API key, and the
// wire correctly refuses to hand that out.
//
// Every query handle here is svc.Uof.Ambient(), not svc.Pool -- the `queries`
// parameter included, which NewUseCases builds the same way -- and that is
// load-bearing twice over. cdc's dispatcher runs Consume inside the same
// transaction that marks the inbox row, so a pool-bound handle would (a) take a
// second connection out of the pool while already holding one, which deadlocks
// the pool once enough deliveries are in flight, and (b) commit the link writes
// below -- CreateCustomerLink, UpdateCustomerLink, CreateInstanceLink -- OUTSIDE
// that transaction, so a rollback afterwards would leave the link written and
// the inbox row unmarked, and redelivery would write it twice.
func newAttioConsumer(svc services.Container, queries *db.Queries) *attio.Consumer {
	customerQueries := customerdb.New(svc.Uof.Ambient())
	instanceQueries := instancedb.New(svc.Uof.Ambient())

	return attio.New(attio.Deps{
		UserProvider: svc.UserProvider,
		Settings:     settings.NewStore(svc.Config.Connectors.VaultBasePath),
		Activations:  activation.NewChecker(activation.NewQueryRepository(queries)),
		Store: attio.NewStore(attio.StoreDeps{
			Customer: getcustomer.NewUseCase(getcustomer.Deps{
				UserProvider:  svc.UserProvider,
				Queries:       customerQueries,
				UsageReporter: svc.UsageReporter,
			}),
			License: getlicense.NewUseCase(getlicense.Deps{
				UserProvider:  svc.UserProvider,
				Queries:       licensedb.New(svc.Uof.Ambient()),
				UsageReporter: svc.UsageReporter,
			}),
			DeploymentZone: getdeploymentzone.NewUseCase(getdeploymentzone.Deps{
				UserProvider:  svc.UserProvider,
				Queries:       zonedb.New(svc.Uof.Ambient()),
				UsageReporter: svc.UsageReporter,
			}),
			CustomerLink: customergetintegrations.NewUseCase(customergetintegrations.Deps{
				UserProvider: svc.UserProvider,
				Queries:      customerQueries,
			}),
			CreateCustomerLink: customercreateintegrations.NewUseCase(customercreateintegrations.Deps{
				UserProvider: svc.UserProvider,
				Queries:      customerQueries,
			}),
			UpdateCustomerLink: customerupdateintegrations.NewUseCase(customerupdateintegrations.Deps{
				UserProvider: svc.UserProvider,
				Queries:      customerQueries,
			}),
			InstanceLink: instancegetintegrations.NewUseCase(instancegetintegrations.Deps{
				UserProvider: svc.UserProvider,
				Queries:      instanceQueries,
			}),
			CreateInstanceLink: instancecreateintegrations.NewUseCase(instancecreateintegrations.Deps{
				UserProvider: svc.UserProvider,
				Queries:      instanceQueries,
			}),
			UpdateInstanceLink: instanceupdateintegrations.NewUseCase(instanceupdateintegrations.Deps{
				UserProvider: svc.UserProvider,
				Queries:      instanceQueries,
			}),
		}),
	})
}
