// Package deactivateconnector turns a connector off for one organization.
//
// It asks nothing about registration or entitlement, and that asymmetry with
// activateconnector is deliberate: an organization must always be able to stop using
// a connector, including one that has since been unregistered or one whose licence
// has lapsed. Refusing to turn something off because the reason it should be off is
// already true would be the wrong way round.
package deactivateconnector

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activation"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

type UseCase struct {
	deps        Deps
	activations activation.Writer
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps, activations: activation.NewQueryRepository(deps.Queries)}
}

// Execute turns the connector off, and reports success whether or not it was on.
//
// Deactivating something already inactive is the same request with a different
// outcome, so it is not an error -- the caller asked for a state and got it. That also
// makes the operation safe to retry, which matters because it is composed by
// deletesettings.
func (h *UseCase) Execute(ctx context.Context, connectorName string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	normalizedName, err := common.ValidateConnectorName(connectorName, "DeactivateConnector.InvalidConnectorName")
	if err != nil {
		return err
	}

	if _, err := h.activations.Deactivate(ctx, user.OrganizationID, normalizedName); err != nil {
		return kaitenerrors.Internal(
			"DeactivateConnector.DeactivationFailed",
			"Failed to persist connector deactivation",
		)
	}

	return nil
}
