package deletemodel

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
}
type UseCase struct {
	deps   Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

func (h *UseCase) Execute(ctx context.Context, slug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	if err := h.deps.AIPolicy.RequireEnabled(ctx); err != nil {
		return err
	}
	return h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(h.deps.Uof.DBTX(ctx))
		if err := q.LockModelCatalogue(ctx, user.OrganizationID); err != nil {
			return err
		}
		model, err := catalogue.Get(ctx, q, user.OrganizationID, slug, "DeleteModel")
		if err != nil {
			return err
		}
		inUse, err := q.ModelInUse(ctx, db.ModelInUseParams{OrganizationID: user.OrganizationID, ModelID: &model.ID})
		if err != nil {
			return err
		}
		if inUse {
			return apierrors.Conflict("DeleteModel.InUse", "model is referenced by a conversion rule")
		}
		if err := q.DeleteModel(ctx, db.DeleteModelParams{OrganizationID: user.OrganizationID, ModelID: model.ID}); err != nil {
			return catalogue.WriteError(err, "DeleteModel")
		}
		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID, events.ModelDeleted.Name, events.ModelDeleted.Type, model, nil))
	})
}
