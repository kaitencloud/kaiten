package components

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/deletecomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponents"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/updatecomponent"
)

type UseCases struct {
	CreateComponent *createcomponent.UseCase
	DeleteComponent *deletecomponent.UseCase
	GetComponent    *getcomponent.UseCase
	GetComponents   *getcomponents.UseCase
	UpdateComponent *updatecomponent.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	return &UseCases{
		CreateComponent: createcomponent.NewUseCase(createcomponent.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		DeleteComponent: deletecomponent.NewUseCase(deletecomponent.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetComponent: getcomponent.NewUseCase(getcomponent.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetComponents: getcomponents.NewUseCase(getcomponents.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		UpdateComponent: updatecomponent.NewUseCase(updatecomponent.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
	}
}
