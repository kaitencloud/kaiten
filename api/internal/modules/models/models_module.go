package models

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/createmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/deletemodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getaiusagecapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/listmodels"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/updatemodel"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type UseCases struct {
	Capabilities getaiusagecapabilities.UseCase
	CreateModel  *createmodel.UseCase
	GetModel     *getmodel.UseCase
	ListModels   *listmodels.UseCase
	UpdateModel  *updatemodel.UseCase
	DeleteModel  *deletemodel.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Uof.Ambient())
	return &UseCases{
		Capabilities: getaiusagecapabilities.UseCase{Policy: aiusage.Policy{Flags: svc.PlatformFlags}},
		CreateModel:  createmodel.NewUseCase(createmodel.Deps{AIPolicy: aiusage.Policy{Flags: svc.PlatformFlags}, UserProvider: svc.UserProvider, Uof: svc.Uof}),
		GetModel:     getmodel.NewUseCase(getmodel.Deps{AIPolicy: aiusage.Policy{Flags: svc.PlatformFlags}, UserProvider: svc.UserProvider, Queries: queries}),
		ListModels:   listmodels.NewUseCase(listmodels.Deps{AIPolicy: aiusage.Policy{Flags: svc.PlatformFlags}, UserProvider: svc.UserProvider, Queries: queries}),
		UpdateModel:  updatemodel.NewUseCase(updatemodel.Deps{AIPolicy: aiusage.Policy{Flags: svc.PlatformFlags}, UserProvider: svc.UserProvider, Uof: svc.Uof}),
		DeleteModel:  deletemodel.NewUseCase(deletemodel.Deps{AIPolicy: aiusage.Policy{Flags: svc.PlatformFlags}, UserProvider: svc.UserProvider, Uof: svc.Uof}),
	}
}
