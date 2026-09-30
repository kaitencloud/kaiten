package releases

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/deleterelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getreleases"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
)

// UseCases aggregates all use cases for the releases module.
// Each use case can also be used independently via its own NewUseCase function.
type UseCases struct {
	CreateRelease *createrelease.UseCase
	DeleteRelease *deleterelease.UseCase
	GetRelease    *getrelease.UseCase
	GetReleases   *getreleases.UseCase
}

// NewUseCases creates a new UseCases instance with all use cases initialized.
func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	return &UseCases{
		CreateRelease: createrelease.NewUseCase(createrelease.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		DeleteRelease: deleterelease.NewUseCase(deleterelease.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetRelease: getrelease.NewUseCase(getrelease.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			ComponentLink: releaselink.New(svc.Pool),
			UsageReporter: svc.UsageReporter,
		}),
		GetReleases: getreleases.NewUseCase(getreleases.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
	}
}
