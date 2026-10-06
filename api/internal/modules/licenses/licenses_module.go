package licenses

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/licenseview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/archivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deprecatelicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicensefamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicensefamilies"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicenseprices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/publishlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/unarchivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseprice"
)

type UseCases struct {
	CreateLicense                   *createlicense.UseCase
	DeleteLicense                   *deletelicense.UseCase
	GetLicense                      *getlicense.UseCase
	GetLicenses                     *getlicenses.UseCase
	ListLicenseFamilies             *listlicensefamilies.UseCase
	GetLicenseFamily                *getlicensefamily.UseCase
	UpdateLicense                   *updatelicense.UseCase
	PublishLicense                  *publishlicense.UseCase
	ArchiveLicense                  *archivelicense.UseCase
	UnarchiveLicense                *unarchivelicense.UseCase
	AssociateEntitlementWithLicense *associateentitlementwithlicense.UseCase
	GetLicenseEntitlement           *getlicenseentitlement.UseCase
	GetLicenseEntitlements          *getlicenseentitlements.UseCase
	DeleteLicenseEntitlement        *deletelicenseentitlement.UseCase
	UpdateLicenseEntitlement        *updatelicenseentitlement.UseCase
	ListLicensePrices               *listlicenseprices.UseCase
	GetLicensePrice                 *getlicenseprice.UseCase
	CreateLicensePrice              *createlicenseprice.UseCase
	UpdateLicensePrice              *updatelicenseprice.UseCase
	DeprecateLicensePrice           *deprecatelicenseprice.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	entitlementReader := licenseview.New(svc.Pool)
	priceDeps := prices.Deps{
		UserProvider: svc.UserProvider,
		Uof:          svc.Uof,
		Gate:         gate.New(svc.Config.Billing.Enabled, svc.ConnectorEntitlements),
	}
	return &UseCases{
		CreateLicense: createlicense.NewUseCase(createlicense.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		DeleteLicense: deletelicense.NewUseCase(deletelicense.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetLicense: getlicense.NewUseCase(getlicense.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetLicenses: getlicenses.NewUseCase(getlicenses.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		ListLicenseFamilies: listlicensefamilies.NewUseCase(listlicensefamilies.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetLicenseFamily: getlicensefamily.NewUseCase(getlicensefamily.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		UpdateLicense: updatelicense.NewUseCase(updatelicense.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		PublishLicense: publishlicense.NewUseCase(publishlicense.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		ArchiveLicense: archivelicense.NewUseCase(archivelicense.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		UnarchiveLicense: unarchivelicense.NewUseCase(unarchivelicense.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		AssociateEntitlementWithLicense: associateentitlementwithlicense.NewUseCase(associateentitlementwithlicense.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		GetLicenseEntitlement: getlicenseentitlement.NewUseCase(getlicenseentitlement.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetLicenseEntitlements: getlicenseentitlements.NewUseCase(getlicenseentitlements.Deps{
			UserProvider:      svc.UserProvider,
			Queries:           queries,
			EntitlementReader: entitlementReader,
			UsageReporter:     svc.UsageReporter,
		}),
		DeleteLicenseEntitlement: deletelicenseentitlement.NewUseCase(deletelicenseentitlement.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		UpdateLicenseEntitlement: updatelicenseentitlement.NewUseCase(updatelicenseentitlement.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		ListLicensePrices:     listlicenseprices.NewUseCase(priceDeps),
		GetLicensePrice:       getlicenseprice.NewUseCase(priceDeps),
		CreateLicensePrice:    createlicenseprice.NewUseCase(priceDeps),
		UpdateLicensePrice:    updatelicenseprice.NewUseCase(priceDeps),
		DeprecateLicensePrice: deprecatelicenseprice.NewUseCase(priceDeps),
	}
}
