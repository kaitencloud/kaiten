// Package activateconnector turns a registered connector on for one organization.
//
// The three questions it asks, in this order, are the three states the frontend has
// to be able to distinguish -- and asking them in this order is what keeps the
// answers from leaking into each other:
//
//  1. Is the connector registered at all? If not, 404: there is nothing to activate,
//     and the organization's license is irrelevant.
//  2. Does this organization's license grant it? If not, 403.
//  3. Can this deployment store its settings at all (Vault)? If not, 422.
//  4. Then activate, idempotently, and run the connector's Activated hook in the
//     same transaction when this was the first activation.
package activateconnector

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/connectorhooks"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activation"
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
	UserProvider currentuser.Provider
	Queries      *db.Queries
	Entitlements services.ConnectorEntitlements
	// Uof runs the activation and the connector's Activated hook in one
	// transaction; Queries must be bound to its ambient handle. Nil runs
	// them without one (unit tests).
	Uof *uow.UnitOfWork
	// Hooks are the connectors' own lifecycle rules; nil has none.
	Hooks connectorhooks.Registry
	// ConnectorsVaultBasePath locates the stored settings an explicit
	// activation hands the Activated hook.
	ConnectorsVaultBasePath string
}

type UseCase struct {
	deps         Deps
	registry     registry.Reader
	activations  activation.Repository
	entitlements services.ConnectorEntitlements
	store        *connectorsettings.Store
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:         deps,
		registry:     registry.NewQueryRepository(deps.Queries),
		activations:  activation.NewQueryRepository(deps.Queries),
		entitlements: services.ConnectorEntitlementsOrAlways(deps.Entitlements),
		store:        connectorsettings.NewStore(deps.ConnectorsVaultBasePath),
	}
}

// Execute activates the connector for the caller's organization. The
// connector's Activated hook receives the settings already stored, if any.
func (h *UseCase) Execute(ctx context.Context, connectorName string) (*schema.ConnectorActivation, error) {
	return h.execute(ctx, connectorName, nil, false)
}

// Check answers what Execute would refuse (not registered, not entitled, no
// Vault) without activating anything, for a caller that must do work of its
// own between deciding and activating.
func (h *UseCase) Check(ctx context.Context, connectorName string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	normalizedName, err := common.ValidateConnectorName(connectorName, "ActivateConnector.InvalidConnectorName")
	if err != nil {
		return err
	}
	connector, err := h.lookup(ctx, normalizedName)
	if err != nil {
		return err
	}
	if err := h.requireEntitlement(ctx, user.OrganizationID, connector); err != nil {
		return err
	}
	return common.RequireVault("ActivateConnector", connector.SettingsSchema)
}

// ExecuteWithSettings is Execute for a caller about to store settings
// (updatesettings): the Activated hook receives those rather than the stored
// ones, which are about to be replaced.
func (h *UseCase) ExecuteWithSettings(ctx context.Context, connectorName string, settings map[string]any) (*schema.ConnectorActivation, error) {
	return h.execute(ctx, connectorName, settings, true)
}

func (h *UseCase) execute(ctx context.Context, connectorName string, settings map[string]any, settingsGiven bool) (*schema.ConnectorActivation, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "ActivateConnector.InvalidConnectorName")
	if err != nil {
		return nil, err
	}

	connector, err := h.lookup(ctx, normalizedName)
	if err != nil {
		return nil, err
	}

	if err := h.requireEntitlement(ctx, user.OrganizationID, connector); err != nil {
		return nil, err
	}

	if err := common.RequireVault("ActivateConnector", connector.SettingsSchema); err != nil {
		return nil, err
	}

	connectorHooks := h.deps.Hooks.For(normalizedName)
	if !settingsGiven && h.deps.Hooks.Has(normalizedName) {
		// Read outside the transaction: Vault is not the database.
		stored, err := h.store.Get(ctx, user.OrganizationID, normalizedName)
		if err != nil && !errors.Is(err, connectorsettings.ErrNotFound) {
			return nil, err
		}
		settings = stored
	}

	var activated *activation.Activation
	err = h.transact(ctx, func(ctx context.Context) error {
		var inserted bool
		var err error
		activated, inserted, err = h.activations.Activate(ctx, user.OrganizationID, normalizedName)
		if err != nil {
			return kaitenerrors.Internal(
				"ActivateConnector.ActivationFailed",
				"Failed to persist connector activation",
			)
		}
		if !inserted {
			return nil
		}
		return connectorHooks.Activated(ctx, user.OrganizationID, settings)
	})
	if err != nil {
		return nil, err
	}

	return &schema.ConnectorActivation{
		ConnectorName: activated.ConnectorName,
		ActivatedAt:   activated.ActivatedAt,
	}, nil
}

// requireEntitlement refuses an organization whose license does not grant the
// connector, and an organization whose license could not be read.
func (h *UseCase) requireEntitlement(
	ctx context.Context, organizationID uuid.UUID, connector *registry.Connector,
) error {
	if connector.EntitlementSlug == nil {
		return nil
	}

	entitled, err := h.entitlements.Entitled(ctx, organizationID, *connector.EntitlementSlug)
	if err != nil {
		slog.ErrorContext(ctx, "connector entitlement could not be verified, refusing the activation",
			"organization_id", organizationID,
			"connector_name", connector.Name,
			"entitlement_slug", *connector.EntitlementSlug,
			"error", err)

		return kaitenerrors.Unavailable(
			"ActivateConnector.EntitlementVerificationUnavailable",
			"Connector entitlement could not be verified. Please retry.",
		)
	}

	if !entitled {
		return kaitenerrors.Forbidden(
			"ActivateConnector.NotEntitled",
			fmt.Sprintf("This organization's licence does not include connector %q", connector.Name),
		)
	}

	return nil
}

func (h *UseCase) transact(ctx context.Context, fn func(ctx context.Context) error) error {
	if h.deps.Uof == nil {
		return fn(ctx)
	}
	return h.deps.Uof.Transact(ctx, fn)
}

func (h *UseCase) lookup(ctx context.Context, normalizedName string) (*registry.Connector, error) {
	connector, err := h.registry.Get(ctx, normalizedName)
	if err != nil {
		if errors.Is(err, registry.ErrNotFound) {
			return nil, kaitenerrors.NotFound(
				"ActivateConnector.NotRegistered",
				fmt.Sprintf("Connector %q is not registered in this deployment", normalizedName),
			)
		}
		return nil, err
	}
	return connector, nil
}
