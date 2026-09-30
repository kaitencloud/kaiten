// Package activateconnector turns a registered connector on for one organization.
//
// The three questions it asks, in this order, are the three states the frontend has
// to be able to distinguish -- and asking them in this order is what keeps the
// answers from leaking into each other:
//
//  1. Is the connector registered at all? If not, 404: there is nothing to activate,
//     and the organization's license is irrelevant.
//  2. Does this organization's license grant it? If not, 403.
//  3. Then activate, idempotently.
package activateconnector

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activation"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      *db.Queries
	Entitlements services.ConnectorEntitlements
}

type UseCase struct {
	deps         Deps
	registry     registry.Reader
	activations  activation.Repository
	entitlements services.ConnectorEntitlements
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:         deps,
		registry:     registry.NewQueryRepository(deps.Queries),
		activations:  activation.NewQueryRepository(deps.Queries),
		entitlements: services.ConnectorEntitlementsOrAlways(deps.Entitlements),
	}
}

func (h *UseCase) Execute(ctx context.Context, connectorName string) (*schema.ConnectorActivation, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "ActivateConnector.InvalidConnectorName")
	if err != nil {
		return nil, err
	}

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

	if err := h.requireEntitlement(ctx, user.OrganizationID, connector); err != nil {
		return nil, err
	}

	activated, err := h.activations.Activate(ctx, user.OrganizationID, normalizedName)
	if err != nil {
		return nil, kaitenerrors.Internal(
			"ActivateConnector.ActivationFailed",
			"Failed to persist connector activation",
		)
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
