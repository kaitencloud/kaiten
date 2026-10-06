package deleteentitlement

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
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

func (h *UseCase) Execute(ctx context.Context, slug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		deletedEntitlement, err := h.repo.DeleteEntitlement(ctx, user.OrganizationID, slug)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			entitlementEvents.EntitlementDeleted.Name,
			entitlementEvents.EntitlementDeleted.Type,
			deletedEntitlement,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if errors.Is(err, errInUse) {
		return h.inUse(ctx, user.OrganizationID, slug)
	}
	if err != nil {
		return err
	}

	h.deps.UsageReporter.DecrementAsync(user.OrganizationID, dogfooding.EntitlementEntitlementSlug)

	return nil
}

// inUse is the refusal of a delete the entitlement's references blocked,
// with how many of each hold it, read after the failed transaction.
func (h *UseCase) inUse(ctx context.Context, organizationID uuid.UUID, slug string) error {
	counts, err := db.New(h.deps.Uof.DBTX(ctx)).CountEntitlementReferences(ctx, db.CountEntitlementReferencesParams{
		OrganizationID: organizationID, Slug: slug,
	})
	if err != nil {
		return err
	}
	return kaitenerrors.ConflictWithErrors("DeleteEntitlement.InUseConflict",
		fmt.Sprintf("Entitlement %q is still granted, counted or priced and cannot be deleted", slug),
		&kaitenerrors.ErrorDetail{
			Message:  "what still references the entitlement",
			Location: "entitlement",
			Value: map[string]any{
				"licenseGrants": counts.LicenseGrants, "usageCounters": counts.UsageCounters, "licensePrices": counts.LicensePrices,
			},
		})
}
