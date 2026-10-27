package licenses

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/licenseview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/archiveconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/archivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deprecatelicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicensefamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listconversionrules"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicensefamilies"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicenseprices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/previewlicenseinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/publishlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/unarchivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updateconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicensefamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type UseCases struct {
	CreateConversionRule  *createconversionrule.UseCase
	UpdateConversionRule  *updateconversionrule.UseCase
	GetConversionRule     *getconversionrule.UseCase
	ArchiveConversionRule *archiveconversionrule.UseCase
	ListConversionRules   *listconversionrules.UseCase

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
	PreviewLicenseInvoice           *previewlicenseinvoice.UseCase
	UpdateLicenseFamily             *updatelicensefamily.UseCase
}

// NewUseCases builds the licences module; preview is what its invoice preview
// reads of the other modules (§8.9), nil for a sample only.
func NewUseCases(svc services.Container, preview previewlicenseinvoice.Sources) *UseCases {
	queries := db.New(svc.Pool)
	entitlementReader := licenseview.New(svc.Pool)
	priceDeps := prices.Deps{
		AIPolicy:     aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
		UserProvider: svc.UserProvider,
		Uof:          svc.Uof,
		Gate:         gate.NewCached(svc.Config.Billing.Enabled, svc.ConnectorEntitlements, svc.Config.Billing.EntitlementCacheTTL),
	}
	return &UseCases{
		CreateConversionRule:  createconversionrule.NewUseCase(createconversionrule.Deps{AIPolicy: aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled}, UserProvider: svc.UserProvider, Uof: svc.Uof}),
		UpdateConversionRule:  updateconversionrule.NewUseCase(updateconversionrule.Deps{AIPolicy: aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled}, UserProvider: svc.UserProvider, Uof: svc.Uof}),
		GetConversionRule:     getconversionrule.NewUseCase(getconversionrule.Deps{AIPolicy: aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled}, UserProvider: svc.UserProvider, Queries: db.New(svc.Uof.Ambient())}),
		ArchiveConversionRule: archiveconversionrule.NewUseCase(archiveconversionrule.Deps{AIPolicy: aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled}, UserProvider: svc.UserProvider, Uof: svc.Uof}),
		ListConversionRules:   listconversionrules.NewUseCase(listconversionrules.Deps{AIPolicy: aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled}, UserProvider: svc.UserProvider, Queries: db.New(svc.Uof.Ambient())}),

		CreateLicense: createlicense.NewUseCase(createlicense.Deps{
			AIPolicy:      aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		DeleteLicense: deletelicense.NewUseCase(deletelicense.Deps{
			AIPolicy:      aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetLicense: getlicense.NewUseCase(getlicense.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetLicenses: getlicenses.NewUseCase(getlicenses.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		ListLicenseFamilies: listlicensefamilies.NewUseCase(listlicensefamilies.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetLicenseFamily: getlicensefamily.NewUseCase(getlicensefamily.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		UpdateLicense: updatelicense.NewUseCase(updatelicense.Deps{
			AIPolicy:     aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider: svc.UserProvider,
			Uof:          svc.Uof,
		}),
		PublishLicense: publishlicense.NewUseCase(publishlicense.Deps{
			AIPolicy:      aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		ArchiveLicense: archivelicense.NewUseCase(archivelicense.Deps{
			AIPolicy:      aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		UnarchiveLicense: unarchivelicense.NewUseCase(unarchivelicense.Deps{
			AIPolicy:      aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		AssociateEntitlementWithLicense: associateentitlementwithlicense.NewUseCase(associateentitlementwithlicense.Deps{
			AIPolicy:      aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		GetLicenseEntitlement: getlicenseentitlement.NewUseCase(getlicenseentitlement.Deps{
			AIPolicy:     aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetLicenseEntitlements: getlicenseentitlements.NewUseCase(getlicenseentitlements.Deps{
			AIPolicy:          aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:      svc.UserProvider,
			Queries:           queries,
			EntitlementReader: entitlementReader,
		}),
		DeleteLicenseEntitlement: deletelicenseentitlement.NewUseCase(deletelicenseentitlement.Deps{
			AIPolicy:      aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		UpdateLicenseEntitlement: updatelicenseentitlement.NewUseCase(updatelicenseentitlement.Deps{
			AIPolicy:     aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider: svc.UserProvider,
			Uof:          svc.Uof,
		}),
		ListLicensePrices:     listlicenseprices.NewUseCase(priceDeps),
		GetLicensePrice:       getlicenseprice.NewUseCase(priceDeps),
		CreateLicensePrice:    createlicenseprice.NewUseCase(priceDeps),
		UpdateLicensePrice:    updatelicenseprice.NewUseCase(priceDeps),
		DeprecateLicensePrice: deprecatelicenseprice.NewUseCase(priceDeps),
		PreviewLicenseInvoice: previewlicenseinvoice.NewUseCase(priceDeps, preview),
		UpdateLicenseFamily: updatelicensefamily.NewUseCase(updatelicensefamily.Deps{
			AIPolicy:     aiusage.Policy{Enabled: svc.Config.AIUsage.Enabled},
			UserProvider: svc.UserProvider, Uof: svc.Uof, Gate: priceDeps.Gate,
		}),
	}
}
