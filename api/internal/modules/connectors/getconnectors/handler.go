package getconnectors

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	registry registry.Lister
}

func NewUseCase(connectorRegistry registry.Lister) *UseCase {
	return &UseCase{registry: connectorRegistry}
}

// Execute returns the whole connector registry. Without it the only way in is
// GET /connectors/{connectorName}, which means a caller has to already know
// the exact name of the connector it is looking for.
func (h *UseCase) Execute(ctx context.Context) ([]schema.Connector, error) {
	connectors, err := h.registry.List(ctx)
	if err != nil {
		return nil, kaitenerrors.Internal(
			"GetConnectors.LoadFailed",
			"Failed to load connector registrations",
		)
	}

	result := make([]schema.Connector, 0, len(connectors))
	for _, connector := range connectors {
		result = append(result, schema.Connector{
			Name:    connector.Name,
			Version: connector.Version,
			// Dropped here until now, which made every connector in the list look
			// ungated: the field is what says a licence is checked before
			// activation, and POST /connectors returns it (registerconnector), so
			// registering a gated connector and reading it back reported two
			// different connectors.
			EntitlementSlug: connector.EntitlementSlug,
			SettingsSchema:  connector.SettingsSchema,
			CreatedAt:       connector.CreatedAt,
			UpdatedAt:       connector.UpdatedAt,
		})
	}

	return result, nil
}

func NewFromContainer(queries *db.Queries) *UseCase {
	return NewUseCase(registry.NewQueryRepository(queries))
}
