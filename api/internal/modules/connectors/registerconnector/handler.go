package registerconnector

import (
	"context"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	registry registry.Repository
}

func NewUseCase(connectorRegistry registry.Repository) *UseCase {
	return &UseCase{registry: connectorRegistry}
}

func (h *UseCase) Execute(ctx context.Context, body RegisterConnectorBody) (*schema.Connector, error) {
	normalizedName, err := common.ValidateConnectorName(body.Name, "RegisterConnector.InvalidName")
	if err != nil {
		return nil, err
	}

	version := strings.TrimSpace(body.Version)
	if version == "" {
		return nil, kaitenerrors.Validation("RegisterConnector.InvalidVersion", "Connector version cannot be empty")
	}

	if err := common.ValidateSettingsSchema(body.SettingsSchema, "RegisterConnector.InvalidSchema"); err != nil {
		return nil, err
	}

	connector, err := h.registry.Upsert(ctx, registry.UpsertInput{
		Name:            normalizedName,
		Version:         version,
		SettingsSchema:  body.SettingsSchema,
		EntitlementSlug: normalizeEntitlementSlug(body.EntitlementSlug),
	})
	if err != nil {
		return nil, kaitenerrors.Internal(
			"RegisterConnector.UpsertFailed",
			"Failed to persist connector registration",
		)
	}

	return &schema.Connector{
		Name:            connector.Name,
		Version:         connector.Version,
		SettingsSchema:  connector.SettingsSchema,
		EntitlementSlug: connector.EntitlementSlug,
		CreatedAt:       connector.CreatedAt,
		UpdatedAt:       connector.UpdatedAt,
	}, nil
}

// normalizeEntitlementSlug folds a slug that is present but blank into "absent".
//
// The two mean the same thing to every reader -- ungated -- and storing the empty
// string would make that true only by accident, since a lookup for the entitlement
// named "" would then be attempted and fail. One representation, decided here rather
// than at each of the places that later ask.
func normalizeEntitlementSlug(slug *string) *string {
	if slug == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*slug)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func NewFromContainer(queries *db.Queries) *UseCase {
	return NewUseCase(registry.NewQueryRepository(queries))
}
