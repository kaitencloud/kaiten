package getsettings

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	connectorsettings "github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider            currentuser.Provider
	ConnectorsVaultBasePath string
	Queries                 *db.Queries
}

type UseCase struct {
	deps     Deps
	store    *connectorsettings.Store
	registry registry.Reader
}

func NewUseCase(deps Deps) *UseCase {
	return NewHandlerWithRegistry(deps, registry.NewQueryRepository(deps.Queries))
}

func NewHandlerWithRegistry(deps Deps, connectorRegistry registry.Reader) *UseCase {
	if connectorRegistry == nil {
		connectorRegistry = registry.NewQueryRepository(deps.Queries)
	}

	return &UseCase{
		deps:     deps,
		store:    connectorsettings.NewStore(deps.ConnectorsVaultBasePath),
		registry: connectorRegistry,
	}
}

func (h *UseCase) Execute(ctx context.Context, connectorName string) (*schema.ConnectorSettings, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "GetConnectorSettings.InvalidConnectorName")
	if err != nil {
		return nil, err
	}

	// The registered schema flags the write-only fields. Settings cannot
	// legitimately exist without a registration, so fail closed rather than
	// returning settings we cannot redact. Read first: an unknown connector is
	// a 404 whether or not anything was stored under its name.
	connector, err := h.registry.Get(ctx, normalizedName)
	if err != nil {
		if errors.Is(err, registry.ErrNotFound) {
			return nil, kaitenerrors.NotFound(
				"GetConnectorSettings.NotRegistered",
				"Connector is not registered",
			)
		}
		return nil, err
	}

	data, err := h.store.Get(ctx, user.OrganizationID, normalizedName)
	if err != nil {
		// Never configured is a state of a registered connector, not a missing
		// resource (V31-33): 200, so a console reading it logs no 404.
		if errors.Is(err, connectorsettings.ErrNotFound) {
			return &schema.ConnectorSettings{
				ConnectorName: normalizedName,
				Settings:      map[string]any{},
				Configured:    false,
			}, nil
		}
		return nil, err
	}

	return &schema.ConnectorSettings{
		ConnectorName: normalizedName,
		Settings:      common.RedactSecrets(data, common.SecretFields(connector.SettingsSchema)),
		Configured:    true,
	}, nil
}
