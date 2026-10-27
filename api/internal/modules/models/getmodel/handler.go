package getmodel

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/models/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Queries      *db.Queries
}
type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }
func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.Model, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.deps.AIPolicy.RequireEnabled(); err != nil {
		return nil, err
	}
	return catalogue.Get(ctx, h.deps.Queries, user.OrganizationID, slug, "GetModel")
}
