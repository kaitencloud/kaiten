// Package deploymentzones is the deployment zone resource: one place a customer
// of THIS Kaiten runs a release.
package deploymentzones

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/deletedeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzones"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/updatedeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
)

// UseCases aggregates all use cases for the deployment zones module.
// Each use case can also be used independently via its own NewUseCase function.
type UseCases struct {
	CreateDeploymentZone *createdeploymentzone.UseCase
	DeleteDeploymentZone *deletedeploymentzone.UseCase
	GetDeploymentZone    *getdeploymentzone.UseCase
	GetDeploymentZones   *getdeploymentzones.UseCase
	UpdateDeploymentZone *updatedeploymentzone.UseCase
}

// NewUseCases creates a new UseCases instance with all use cases initialized.
func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	return &UseCases{
		CreateDeploymentZone: createdeploymentzone.NewUseCase(createdeploymentzone.Deps{
			UserProvider:         svc.UserProvider,
			UsageReporter:        svc.UsageReporter,
			Uof:                  svc.Uof,
			MetadataFieldsLister: validator.NewLister(svc.Pool),
		}),
		DeleteDeploymentZone: deletedeploymentzone.NewUseCase(deletedeploymentzone.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetDeploymentZone: getdeploymentzone.NewUseCase(getdeploymentzone.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetDeploymentZones: getdeploymentzones.NewUseCase(getdeploymentzones.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		UpdateDeploymentZone: updatedeploymentzone.NewUseCase(updatedeploymentzone.Deps{
			UserProvider:         svc.UserProvider,
			Uof:                  svc.Uof,
			UsageReporter:        svc.UsageReporter,
			MetadataFieldsLister: validator.NewLister(svc.Pool),
		}),
	}
}
