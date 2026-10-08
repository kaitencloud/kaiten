package deletesettings

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/connectorhooks"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/deactivateconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	connectorsettings "github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider            currentuser.Provider
	ConnectorsVaultBasePath string
	Queries                 *db.Queries
	// Uof and Hooks are handed to the composed deactivation; Hooks also
	// guards the deletion of the settings.
	Uof   *uow.UnitOfWork
	Hooks connectorhooks.Registry
}

type UseCase struct {
	deps  Deps
	store *connectorsettings.Store
	// deactivator is composed for the reason updatesettings composes its opposite:
	// clearing a connector's settings is how an organization turns it off, and the
	// activation row has to end up where the explicit DELETE would leave it.
	deactivator deactivator
}

// deactivator is the one operation this handler composes, declared as its own
// interface so the dependency is on the behaviour rather than on the package.
type deactivator interface {
	ExecuteAs(ctx context.Context, connectorName, operation string, settings map[string]any) error
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:  deps,
		store: connectorsettings.NewStore(deps.ConnectorsVaultBasePath),
		deactivator: deactivateconnector.NewUseCase(deactivateconnector.Deps{
			UserProvider:            deps.UserProvider,
			Queries:                 deps.Queries,
			Uof:                     deps.Uof,
			Hooks:                   deps.Hooks,
			ConnectorsVaultBasePath: deps.ConnectorsVaultBasePath,
		}),
	}
}

func (h *UseCase) Execute(ctx context.Context, connectorName string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "DeleteConnectorSettings.InvalidConnectorName")
	if err != nil {
		return err
	}

	// The connector's own guard first: settings a payment provider still
	// needs are not deleted under the invoices that route to it.
	if err := h.deps.Hooks.For(normalizedName).CanDeactivate(ctx, user.OrganizationID, "DeleteConnectorSettings"); err != nil {
		return err
	}
	// Read before deleting, for the Deactivated hook.
	var stored map[string]any
	if h.deps.Hooks.Has(normalizedName) {
		var err error
		stored, err = h.store.Get(ctx, user.OrganizationID, normalizedName)
		if err != nil && !errors.Is(err, connectorsettings.ErrNotFound) {
			return err
		}
	}

	// Settings first, then the activation row.
	//
	// The reverse order would leave a window where the connector reads as inactive
	// while its credentials are still in the store, which is the more dangerous of
	// the two half-states: an operator looking at the activation table would believe
	// the secret was gone. This way a partial failure leaves the connector active
	// with no settings, which every settings path already handles.
	if err := h.store.Delete(ctx, user.OrganizationID, normalizedName); err != nil {
		return err
	}

	return h.deactivator.ExecuteAs(ctx, normalizedName, "DeleteConnectorSettings", stored)
}
