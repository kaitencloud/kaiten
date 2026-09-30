package associateentitlementwithlicense

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
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

func (h *UseCase) Execute(ctx context.Context, licenseSlug string, command *Command) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	// Associating an entitlement with a license creates a license-entitlement
	// grant, so it is enforced and billed like any other resource creation.
	_, err = dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, user.OrganizationID, dogfooding.LicenseEntitlementEntitlementSlug,
		"AssociateEntitlementWithLicense.LicenseEntitlementLimitReached", "License entitlement creation limit reached for this organization", nil,
		func(ctx context.Context) (struct{}, error) {
			return struct{}{}, h.persist(ctx, licenseSlug, command, user.ID, user.OrganizationID)
		})

	return err
}

func (h *UseCase) persist(ctx context.Context, licenseSlug string, command *Command, userID, organizationID uuid.UUID) error {
	return h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		// h.repo resolves the DBTX active for ctx on each call -- both this
		// module's own Queries and entitlements' licenseview.Port -- so it
		// joins this same transaction without checking out a second pool
		// connection. A pool-bound reader called from inside this Transact
		// would need to check out that second connection while this
		// goroutine already holds one for the transaction; under load (many
		// concurrent callers, e.g. the stress-test seeder profile) every
		// goroutine ends up holding one connection and waiting on a second
		// that never frees, deadlocking the whole pool.
		assignedEntitlementWithLicense, err := h.repo.AssociateEntitlementToLicense(ctx, licenseSlug, command, userID, organizationID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			organizationID,
			events.LicenseEntitlementAssigned.Name,
			events.LicenseEntitlementAssigned.Type,
			assignedEntitlementWithLicense,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
}
