package deletesettings

import (
	"context"

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
	Execute(ctx context.Context, connectorName string) error
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:  deps,
		store: connectorsettings.NewStore(deps.ConnectorsVaultBasePath),
		deactivator: deactivateconnector.NewUseCase(deactivateconnector.Deps{
			UserProvider: deps.UserProvider,
			Queries:      deps.Queries,
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

	return h.deactivator.Execute(ctx, normalizedName)
}
