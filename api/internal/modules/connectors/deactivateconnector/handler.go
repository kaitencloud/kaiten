// Package deactivateconnector turns a connector off for one organization.
//
// It asks nothing about registration or entitlement, and that asymmetry with
// activateconnector is deliberate: an organization must always be able to stop using
// a connector, including one that has since been unregistered or one whose licence
// has lapsed. Refusing to turn something off because the reason it should be off is
// already true would be the wrong way round. The one exception is a connector whose
// own hook says something still depends on it: a payment provider that invoices
// still route to cannot be disconnected under them.
package deactivateconnector

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/connectorhooks"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activation"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	connectorsettings "github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      *db.Queries
	// Uof runs the deactivation and the connector's Deactivated hook in one
	// transaction; Queries must be bound to its ambient handle. Nil runs
	// them without one (unit tests).
	Uof *uow.UnitOfWork
	// Hooks are the connectors' own lifecycle rules; nil has none.
	Hooks connectorhooks.Registry
	// ConnectorsVaultBasePath locates the stored settings the Deactivated
	// hook receives.
	ConnectorsVaultBasePath string
}

type UseCase struct {
	deps        Deps
	activations activation.Writer
	store       *connectorsettings.Store
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps: deps, activations: activation.NewQueryRepository(deps.Queries),
		store: connectorsettings.NewStore(deps.ConnectorsVaultBasePath),
	}
}

// Execute turns the connector off, and reports success whether or not it was on.
//
// Deactivating something already inactive is the same request with a different
// outcome, so it is not an error -- the caller asked for a state and got it. That also
// makes the operation safe to retry, which matters because it is composed by
// deletesettings.
func (h *UseCase) Execute(ctx context.Context, connectorName string) error {
	return h.ExecuteAs(ctx, connectorName, "DeactivateConnector", nil)
}

// ExecuteAs is Execute for a use case that composes it (deletesettings):
// operation prefixes the hook's refusal, and settings, when not nil, are the
// ones the caller read before deleting them.
func (h *UseCase) ExecuteAs(ctx context.Context, connectorName, operation string, settings map[string]any) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "DeactivateConnector.InvalidConnectorName")
	if err != nil {
		return err
	}

	connectorHooks := h.deps.Hooks.For(normalizedName)
	if err := connectorHooks.CanDeactivate(ctx, user.OrganizationID, operation); err != nil {
		return err
	}
	if settings == nil && h.deps.Hooks.Has(normalizedName) {
		stored, err := h.store.Get(ctx, user.OrganizationID, normalizedName)
		if err != nil && !errors.Is(err, connectorsettings.ErrNotFound) {
			return err
		}
		settings = stored
	}

	run := func(ctx context.Context) error {
		removed, err := h.activations.Deactivate(ctx, user.OrganizationID, normalizedName)
		if err != nil {
			return kaitenerrors.Internal(
				"DeactivateConnector.DeactivationFailed",
				"Failed to persist connector deactivation",
			)
		}
		if !removed {
			return nil
		}
		return connectorHooks.Deactivated(ctx, user.OrganizationID, settings)
	}
	if h.deps.Uof == nil {
		return run(ctx)
	}
	return h.deps.Uof.Transact(ctx, run)
}
