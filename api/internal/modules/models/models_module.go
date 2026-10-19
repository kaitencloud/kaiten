package models

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/createmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/deletemodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/listmodels"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/updatemodel"
)

type UseCases struct {
	CreateModel *createmodel.UseCase
	GetModel    *getmodel.UseCase
	ListModels  *listmodels.UseCase
	UpdateModel *updatemodel.UseCase
	DeleteModel *deletemodel.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Uof.Ambient())
	return &UseCases{
		CreateModel: createmodel.NewUseCase(createmodel.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof}),
		GetModel:    getmodel.NewUseCase(getmodel.Deps{UserProvider: svc.UserProvider, Queries: queries}),
		ListModels:  listmodels.NewUseCase(listmodels.Deps{UserProvider: svc.UserProvider, Queries: queries}),
		UpdateModel: updatemodel.NewUseCase(updatemodel.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof}),
		DeleteModel: deletemodel.NewUseCase(deletemodel.Deps{UserProvider: svc.UserProvider, Uof: svc.Uof}),
	}
}
