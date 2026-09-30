package getconnector

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

func (h *UseCase) Execute(ctx context.Context, connectorName string) (*schema.Connector, error) {
	normalizedName, err := common.ValidateConnectorName(connectorName, "GetConnector.InvalidConnectorName")
	if err != nil {
		return nil, err
	}

	connector, err := h.registry.Get(ctx, normalizedName)
	if err != nil {
		if errors.Is(err, registry.ErrNotFound) {
			return nil, kaitenerrors.NotFound(
				"GetConnector.NotFound",
				"Connector is not registered",
			)
		}

		return nil, kaitenerrors.Internal(
			"GetConnector.LoadFailed",
			"Failed to load connector registration",
		)
	}

	return &schema.Connector{
		Name:    connector.Name,
		Version: connector.Version,
		// See getconnectors: absent here meant every gated connector read as
		// ungated, and activateconnector gates on this very field.
		EntitlementSlug: connector.EntitlementSlug,
		SettingsSchema:  connector.SettingsSchema,
		CreatedAt:       connector.CreatedAt,
		UpdatedAt:       connector.UpdatedAt,
	}, nil
}

func NewFromContainer(queries *db.Queries) *UseCase {
	return NewUseCase(registry.NewQueryRepository(queries))
}
