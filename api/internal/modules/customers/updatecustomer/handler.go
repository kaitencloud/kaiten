package updatecustomer

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	Uof           *uow.UnitOfWork
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps   Deps
	repo   *CommandRepository
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:   deps,
		repo:   NewCommandRepository(deps.Uof),
		outbox: outbox.NewScopedRepository(deps.Uof),
	}
}

func (h *UseCase) Execute(ctx context.Context, command *Command, slug string) (*schema.Customer, error) {
	if email := command.BillingEmail; email != nil && *email != "" {
		if err := schema.ValidateBillingEmail("UpdateCustomer", *email); err != nil {
			return nil, err
		}
	}
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	var customer *schema.Customer

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		updatedUser, err := h.repo.UpdateCustomer(ctx, command, slug, u.ID, u.OrganizationID)
		if err != nil {
			return err
		}
		customer = updatedUser

		event := outbox.NewOutboxMessage(
			u.OrganizationID,
			events.CustomerUpdated.Name,
			events.CustomerUpdated.Type,
			updatedUser.WithoutPersonalData(),
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(u.OrganizationID, dogfooding.CustomerUpdatedEntitlementSlug)

	return customer, nil
}
