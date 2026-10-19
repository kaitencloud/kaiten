package createmodel

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Deps struct {
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

func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.Model, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	model, params, err := catalogue.Prepare(*command, "CreateModel")
	if err != nil {
		return nil, err
	}
	params.OrganizationID, params.UserID = user.OrganizationID, user.ID
	var created *schema.Model
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(h.deps.Uof.DBTX(ctx))
		if err := q.LockModelCatalogue(ctx, user.OrganizationID); err != nil {
			return err
		}
		exists, err := q.ModelSlugExists(ctx, db.ModelSlugExistsParams{OrganizationID: user.OrganizationID, Slug: model.Slug})
		if err != nil {
			return err
		}
		if exists {
			return apierrors.Conflict("CreateModel.SlugConflict", "model slug already exists")
		}
		// Check the reverse direction too: a new slug cannot take an existing
		// provider ID away from another model by winning slug-first resolution.
		exists, err = q.ModelSlugIsExternalID(ctx, db.ModelSlugIsExternalIDParams{OrganizationID: user.OrganizationID, Slug: model.Slug})
		if err != nil {
			return err
		}
		if exists {
			return apierrors.Conflict("CreateModel.ExternalIdConflict", "model slug is another model's external ID")
		}
		if err := catalogue.CheckExternalIDs(ctx, q, user.OrganizationID, uuid.Nil, model.ExternalIDs, "CreateModel"); err != nil {
			return err
		}
		row, err := q.CreateModel(ctx, params)
		if err != nil {
			return catalogue.WriteError(err, "CreateModel")
		}
		if err := catalogue.ReplaceExternalIDs(ctx, q, user.OrganizationID, row.ID, model.ExternalIDs); err != nil {
			return catalogue.WriteError(err, "CreateModel")
		}
		created, err = catalogue.Get(ctx, q, user.OrganizationID, row.Slug, "CreateModel")
		if err != nil {
			return err
		}
		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID, events.ModelCreated.Name, events.ModelCreated.Type, created, nil))
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}
