package getsettingsschema

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	registry registry.Reader
}

func NewUseCase(connectorRegistry registry.Reader) *UseCase {
	return &UseCase{registry: connectorRegistry}
}

func (h *UseCase) Execute(ctx context.Context, connectorName string) (*schema.ConnectorSettingsSchema, error) {
	normalizedName, err := common.ValidateConnectorName(connectorName, "GetConnectorSettingsSchema.InvalidConnectorName")
	if err != nil {
		return nil, err
	}

	connector, err := h.registry.Get(ctx, normalizedName)
	if err != nil {
		if errors.Is(err, registry.ErrNotFound) {
			return nil, kaitenerrors.NotFound(
				"GetConnectorSettingsSchema.NotRegistered",
				"Connector is not registered",
			)
		}

		return nil, kaitenerrors.Internal(
			"GetConnectorSettingsSchema.LoadFailed",
			"Failed to load connector registration",
		)
	}

	return &schema.ConnectorSettingsSchema{
		ConnectorName: connector.Name,
		Version:       connector.Version,
		Schema:        connector.SettingsSchema,
	}, nil
}

// NewFromContainer creates a new GetSettingsSchema handler.
func NewFromContainer(queries *db.Queries) *UseCase {
	return NewUseCase(registry.NewQueryRepository(queries))
}
