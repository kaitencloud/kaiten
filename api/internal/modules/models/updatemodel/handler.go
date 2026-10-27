package updatemodel

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
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

func (h *UseCase) Execute(ctx context.Context, slug string, command *Command) (*schema.Model, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.deps.AIPolicy.RequireEnabled(); err != nil {
		return nil, err
	}
	var updated *schema.Model
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(h.deps.Uof.DBTX(ctx))
		if err := q.LockModelCatalogue(ctx, user.OrganizationID); err != nil {
			return err
		}
		before, err := catalogue.Get(ctx, q, user.OrganizationID, slug, "UpdateModel")
		if err != nil {
			return err
		}
		if command.Slug != before.Slug {
			return apierrors.UnprocessableEntity("UpdateModel.ImmutableSlug", "model slug is immutable")
		}
		if command.Modality != before.Modality {
			return apierrors.UnprocessableEntity("UpdateModel.ImmutableModality", "model modality is immutable")
		}
		model, params, err := catalogue.Prepare(*command, "UpdateModel")
		if err != nil {
			return err
		}
		if err := catalogue.CheckExternalIDs(ctx, q, user.OrganizationID, before.ID, model.ExternalIDs, "UpdateModel"); err != nil {
			return err
		}
		_, err = q.UpdateModel(ctx, db.UpdateModelParams{
			OrganizationID: user.OrganizationID, UserID: user.ID, ModelID: before.ID,
			Name: params.Name, Description: params.Description, Vendor: params.Vendor, Status: params.Status, Metadata: params.Metadata,
			VendorCostCurrency:      params.VendorCostCurrency,
			VendorCostPerInputToken: params.VendorCostPerInputToken, VendorCostPerCachedInputToken: params.VendorCostPerCachedInputToken,
			VendorCostPerCacheWriteToken: params.VendorCostPerCacheWriteToken, VendorCostPerOutputToken: params.VendorCostPerOutputToken,
			VendorCostPerRequest: params.VendorCostPerRequest, VendorCostPerUnit: params.VendorCostPerUnit,
		})
		if err != nil {
			return catalogue.WriteError(err, "UpdateModel")
		}
		if err := catalogue.ReplaceExternalIDs(ctx, q, user.OrganizationID, before.ID, model.ExternalIDs); err != nil {
			return catalogue.WriteError(err, "UpdateModel")
		}
		updated, err = catalogue.Get(ctx, q, user.OrganizationID, slug, "UpdateModel")
		if err != nil {
			return err
		}
		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID, events.ModelUpdated.Name, events.ModelUpdated.Type, schema.ModelUpdated{Before: before, After: updated}, nil))
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}
