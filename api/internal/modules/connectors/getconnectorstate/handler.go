// Package getconnectorstate answers, in one request, everything the frontend needs to
// know about one connector for the current organization.
package getconnectorstate

import (
	"context"
	"errors"
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
	activations  activation.Reader
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

func (h *UseCase) Execute(ctx context.Context, connectorName string) (*schema.ConnectorState, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "GetConnectorState.InvalidConnectorName")
	if err != nil {
		return nil, err
	}

	state := &schema.ConnectorState{ConnectorName: normalizedName}

	connector, err := h.registry.Get(ctx, normalizedName)
	if err != nil {
		if errors.Is(err, registry.ErrNotFound) {
			// Not an error: "this deployment does not have that connector" is a state
			// the client renders, not a request that went wrong. Entitled and
			// Activated stay false because neither can be true of something that is
			// not there.
			return state, nil
		}
		return nil, err
	}

	state.Available = true
	state.Version = &connector.Version

	entitled, err := h.entitled(ctx, user.OrganizationID, connector)
	if err != nil {
		return nil, err
	}
	state.Entitled = entitled

	activated, err := h.activations.Get(ctx, user.OrganizationID, normalizedName)
	switch {
	case errors.Is(err, activation.ErrNotFound):
	case err != nil:
		return nil, err
	default:
		state.Activated = true
		state.ActivatedAt = &activated.ActivatedAt
	}

	return state, nil
}

// entitled reads the licence gate, failing closed on an answer it could not get.
//
// Refusing the whole read rather than reporting Entitled: false is the honest choice
// here, and it is not the same trade activateconnector makes. There, failing closed
// means refusing an action; here it would mean telling the client something specific
// and wrong -- "your licence does not include this" -- which a user would act on by
// contacting sales about a connector they already paid for. A 503 says what actually
// happened and the page retries.
func (h *UseCase) entitled(
	ctx context.Context, organizationID uuid.UUID, connector *registry.Connector,
) (bool, error) {
	if connector.EntitlementSlug == nil {
		return true, nil
	}

	entitled, err := h.entitlements.Entitled(ctx, organizationID, *connector.EntitlementSlug)
	if err != nil {
		slog.ErrorContext(ctx, "connector entitlement could not be verified",
			"organization_id", organizationID,
			"connector_name", connector.Name,
			"entitlement_slug", *connector.EntitlementSlug,
			"error", err)

		return false, kaitenerrors.Unavailable(
			"GetConnectorState.EntitlementVerificationUnavailable",
			"Connector entitlement could not be verified. Please retry.",
		)
	}

	return entitled, nil
}
