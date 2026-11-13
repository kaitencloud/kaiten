// Package dashboard serves the console's home: one read use case that computes
// the organization's summary in the database, over every row, in one request.
//
// It owns no table. Its queries read the other modules' tables through one
// sqlc package of its own, because the home crosses every module and no module
// should learn the others' tables to serve it.
package dashboard

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/getsummary"
	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/infrastructure/db"
)

// UseCases contains the use case handlers for the dashboard module.
type UseCases struct {
	GetSummary *getsummary.UseCase
}

// NewUseCases creates a new UseCases instance with all handlers initialized.
func NewUseCases(svc services.Container) *UseCases {
	return &UseCases{
		GetSummary: getsummary.NewUseCase(getsummary.Deps{
			UserProvider: svc.UserProvider,
			Queries:      db.New(svc.Pool),
		}),
	}
}
