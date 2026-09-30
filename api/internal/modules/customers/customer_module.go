package customers

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/deletecustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/deleteintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomers"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/updatecustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/updateintegrations"
)

// UseCases aggregates all use cases for the customers module.
// Each use case can also be used independently via its own NewUseCase function.
type UseCases struct {
	CreateIntegration *createintegrations.UseCase
	CreateCustomer    *createcustomer.UseCase
	DeleteIntegration *deleteintegrations.UseCase
	DeleteCustomer    *deletecustomer.UseCase
	GetIntegration    *getintegrations.UseCase
	GetCustomer       *getcustomer.UseCase
	GetCustomers      *getcustomers.UseCase
	UpdateIntegration *updateintegrations.UseCase
	UpdateCustomer    *updatecustomer.UseCase
}

// NewUseCases creates a new UseCases instance with all use cases initialized.
func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	return &UseCases{
		CreateIntegration: createintegrations.NewUseCase(createintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		CreateCustomer: createcustomer.NewUseCase(createcustomer.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		DeleteIntegration: deleteintegrations.NewUseCase(deleteintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		DeleteCustomer: deletecustomer.NewUseCase(deletecustomer.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetIntegration: getintegrations.NewUseCase(getintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		GetCustomer: getcustomer.NewUseCase(getcustomer.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetCustomers: getcustomers.NewUseCase(getcustomers.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		UpdateIntegration: updateintegrations.NewUseCase(updateintegrations.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		UpdateCustomer: updatecustomer.NewUseCase(updatecustomer.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
	}
}
