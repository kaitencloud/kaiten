package entitlements

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/addentitlementtogroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementexception"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/deleteentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/deleteentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroups"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlementgroupusage"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/listentitlementexceptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/removeentitlementfromgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/revokeentitlementexception"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/updateentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/updateentitlementgroup"
)

// UseCases aggregates all use cases for the entitlements module.
type UseCases struct {
	CreateEntitlement          *createentitlement.UseCase
	DeleteEntitlement          *deleteentitlement.UseCase
	GetEntitlement             *getentitlement.UseCase
	GetEntitlements            *getentitlements.UseCase
	UpdateEntitlement          *updateentitlement.UseCase
	CreateEntitlementGroup     *createentitlementgroup.UseCase
	GetEntitlementGroup        *getentitlementgroup.UseCase
	GetEntitlementGroups       *getentitlementgroups.UseCase
	UpdateEntitlementGroup     *updateentitlementgroup.UseCase
	DeleteEntitlementGroup     *deleteentitlementgroup.UseCase
	AddEntitlementToGroup      *addentitlementtogroup.UseCase
	RemoveEntitlementFromGroup *removeentitlementfromgroup.UseCase
	GetEntitlementGroupUsage   *getentitlementgroupusage.UseCase
	CreateEntitlementException *createentitlementexception.UseCase
	ListEntitlementExceptions  *listentitlementexceptions.UseCase
	RevokeEntitlementException *revokeentitlementexception.UseCase
	// ExceptionExpiry is step (g) of the billing-lifecycle job, which runs it
	// whether or not billing is enabled.
	ExceptionExpiry *exceptions.Expiry
}

// NewUseCases creates a new UseCases instance with all use cases initialized.
func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	exceptionDeps := exceptions.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof}
	return &UseCases{
		CreateEntitlement: createentitlement.NewUseCase(createentitlement.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		DeleteEntitlement: deleteentitlement.NewUseCase(deleteentitlement.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetEntitlement: getentitlement.NewUseCase(getentitlement.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetEntitlements: getentitlements.NewUseCase(getentitlements.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		UpdateEntitlement: updateentitlement.NewUseCase(updateentitlement.Deps{
			UserProvider: svc.UserProvider,
			Uof:          svc.Uof,
		}),
		CreateEntitlementGroup: createentitlementgroup.NewUseCase(createentitlementgroup.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		GetEntitlementGroup: getentitlementgroup.NewUseCase(getentitlementgroup.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetEntitlementGroups: getentitlementgroups.NewUseCase(getentitlementgroups.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		UpdateEntitlementGroup: updateentitlementgroup.NewUseCase(updateentitlementgroup.Deps{
			UserProvider: svc.UserProvider,
			Uof:          svc.Uof,
		}),
		DeleteEntitlementGroup: deleteentitlementgroup.NewUseCase(deleteentitlementgroup.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		AddEntitlementToGroup: addentitlementtogroup.NewUseCase(addentitlementtogroup.Deps{
			UserProvider: svc.UserProvider,
			Uof:          svc.Uof,
		}),
		RemoveEntitlementFromGroup: removeentitlementfromgroup.NewUseCase(removeentitlementfromgroup.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetEntitlementGroupUsage: getentitlementgroupusage.NewUseCase(getentitlementgroupusage.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		CreateEntitlementException: createentitlementexception.NewUseCase(exceptionDeps),
		ListEntitlementExceptions:  listentitlementexceptions.NewUseCase(exceptionDeps),
		RevokeEntitlementException: revokeentitlementexception.NewUseCase(exceptionDeps),
		ExceptionExpiry:            exceptions.NewExpiry(svc.Uof),
	}
}
