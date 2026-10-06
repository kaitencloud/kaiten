package updatesettings

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/connectorhooks"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activateconnector"
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
	// Entitlements gates the activation this handler composes. Threaded through
	// rather than resolved here so that both doors onto activation -- the explicit
	// PUT and this one -- apply the same licence check.
	Entitlements services.ConnectorEntitlements
	// Uof and Hooks are handed to the composed activation; Hooks also
	// validates the settings before anything is written.
	Uof   *uow.UnitOfWork
	Hooks connectorhooks.Registry
}

type UseCase struct {
	deps     Deps
	store    *connectorsettings.Store
	registry registry.Reader
	// activator is composed rather than reimplemented: configuring a connector is
	// how an organization turns one on, so this handler must leave the activation
	// row exactly as the explicit endpoint would -- including refusing an
	// unlicensed connector. Composing the use case is the pattern
	// integrations/upsertintegration uses for createcustomer, and for the same
	// reason: reaching past a use case to its repository is how the invariants it
	// enforces get skipped.
	activator activator
}

// activator is the one operation this handler composes, declared as its own
// interface so the dependency is on the behaviour rather than on the package.
type activator interface {
	Check(ctx context.Context, connectorName string) error
	ExecuteWithSettings(ctx context.Context, connectorName string, settings map[string]any) (*schema.ConnectorActivation, error)
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
		activator: activateconnector.NewUseCase(activateconnector.Deps{
			UserProvider:            deps.UserProvider,
			Queries:                 deps.Queries,
			Entitlements:            deps.Entitlements,
			Uof:                     deps.Uof,
			Hooks:                   deps.Hooks,
			ConnectorsVaultBasePath: deps.ConnectorsVaultBasePath,
		}),
	}
}

func (h *UseCase) Execute(ctx context.Context, connectorName string, body schema.ConnectorSettings) (*schema.ConnectorSettings, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "UpdateConnectorSettings.InvalidConnectorName")
	if err != nil {
		return nil, err
	}

	connector, err := h.registry.Get(ctx, normalizedName)
	if err != nil {
		if errors.Is(err, registry.ErrNotFound) {
			return nil, kaitenerrors.NotFound(
				"UpdateConnectorSettings.NotRegistered",
				"Connector is not registered",
			)
		}

		return nil, err
	}

	if len(body.Settings) == 0 {
		return nil, kaitenerrors.Validation(
			"UpdateConnectorSettings.InvalidPayload",
			"Connector settings payload cannot be empty",
		)
	}

	// Write-only fields may be omitted (or echoed redacted/empty) to keep the
	// stored value, so clients never have to round-trip plaintext secrets.
	// Merge before schema validation: secret fields are usually required.
	// Nothing below can work without Vault: say so before reading from it.
	if err := common.RequireVault("UpdateConnectorSettings", connector.SettingsSchema); err != nil {
		return nil, err
	}

	secretFields := common.SecretFields(connector.SettingsSchema)
	settings := body.Settings
	var stored map[string]any
	if len(secretFields) > 0 || h.deps.Hooks.Has(normalizedName) {
		stored, err = h.store.Get(ctx, user.OrganizationID, normalizedName)
		if err != nil && !errors.Is(err, connectorsettings.ErrNotFound) {
			return nil, err
		}
	}
	if len(secretFields) > 0 {
		settings = common.MergeStoredSecrets(settings, stored, secretFields)
	}

	if err := common.ValidateConnectorSettings(normalizedName, connector.SettingsSchema, settings, "UpdateConnectorSettings.InvalidPayloadSchema"); err != nil {
		return nil, err
	}

	// The connector's own rules (a credential the provider refuses, a key of
	// another account) come before anything is written: a refused write must
	// leave neither an activation row nor a stored secret behind. The
	// activation's own refusals (licence, Vault) come first, so that an
	// organization that may not use the connector never reaches its provider.
	if err := h.activator.Check(ctx, normalizedName); err != nil {
		return nil, err
	}
	if err := h.deps.Hooks.For(normalizedName).ValidateSettings(ctx, user.OrganizationID, settings, stored); err != nil {
		return nil, err
	}

	// Activate BEFORE writing the settings, not after.
	//
	// The order is the licence check: activation is what refuses a connector this
	// organization is not entitled to, and refusing after the secret is already in
	// the store would mean an unlicensed organization could stash its Attio API key
	// and get a 403 describing a write that had already happened. It also fails the
	// right way round on a partial failure -- an activation with no settings reads
	// as "on but not configured", which the settings endpoints already handle,
	// whereas settings with no activation would be a connector configured and
	// invisible.
	if _, err := h.activator.ExecuteWithSettings(ctx, normalizedName, settings); err != nil {
		return nil, err
	}

	if err := h.store.Upsert(ctx, user.OrganizationID, normalizedName, settings); err != nil {
		return nil, err
	}

	updatedSettings, err := h.store.Get(ctx, user.OrganizationID, normalizedName)
	if err != nil {
		return nil, err
	}

	return &schema.ConnectorSettings{
		ConnectorName: normalizedName,
		Settings:      common.RedactSecrets(updatedSettings, secretFields),
	}, nil
}
