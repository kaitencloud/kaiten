package connectors

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activation"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
)

// ActivationReader answers whether an organization activated a connector, for
// whatever another module resolves from one (a payment provider). Reading the
// activation is this module's to do, so it is exposed here rather than reached
// through its repository.
type ActivationReader struct {
	checker *activation.Checker
}

// NewActivationReader reads activations through svc's ambient handle, so it
// joins the transaction its caller runs in.
func NewActivationReader(svc services.Container) *ActivationReader {
	return &ActivationReader{checker: activation.NewChecker(activation.NewQueryRepository(db.New(svc.Uof.Ambient())))}
}

// IsActive reports whether the organization activated the connector.
func (r *ActivationReader) IsActive(ctx context.Context, organizationID uuid.UUID, connectorName string) (bool, error) {
	return r.checker.Activated(ctx, organizationID, connectorName)
}

// SettingsReader reads a connector's stored settings unredacted, for the
// connector's own code in another module (a payment provider needs its key,
// as the Attio consumer does). The wire still redacts them.
type SettingsReader struct {
	store *settings.Store
}

// NewSettingsReader reads from the deployment's connector settings store.
func NewSettingsReader(svc services.Container) *SettingsReader {
	return &SettingsReader{store: settings.NewStore(svc.Config.Connectors.VaultBasePath)}
}

// Get answers the stored settings, or nil and no error when there are none.
func (r *SettingsReader) Get(ctx context.Context, organizationID uuid.UUID, connectorName string) (map[string]any, error) {
	stored, err := r.store.Get(ctx, organizationID, connectorName)
	if errors.Is(err, settings.ErrNotFound) {
		return nil, nil
	}
	return stored, err
}
