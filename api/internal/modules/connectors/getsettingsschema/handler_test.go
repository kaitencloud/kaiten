package getsettingsschema

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type stubRegistry struct {
	getFn func(ctx context.Context, name string) (*registry.Connector, error)
}

func (s *stubRegistry) Get(ctx context.Context, name string) (*registry.Connector, error) {
	if s.getFn == nil {
		return nil, errors.New("get function not configured")
	}
	return s.getFn(ctx, name)
}

func TestHandler_Handle_ReturnsSchemaForRegisteredConnector(t *testing.T) {
	h := NewUseCase(&stubRegistry{getFn: func(_ context.Context, name string) (*registry.Connector, error) {
		now := time.Now()
		if name != "kaiten.integration.crm.attio" {
			return nil, registry.ErrNotFound
		}
		return &registry.Connector{
			Name:    name,
			Version: "1.0.0",
			SettingsSchema: map[string]any{
				"$schema": "https://json-schema.org/draft/2020-12/schema",
				"type":    "object",
			},
			CreatedAt: now,
			UpdatedAt: now,
		}, nil
	}})

	resp, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, "kaiten.integration.crm.attio", resp.ConnectorName)
	require.Equal(t, "1.0.0", resp.Version)
	require.Equal(t, "https://json-schema.org/draft/2020-12/schema", resp.Schema["$schema"])
}

func TestHandler_Handle_RejectsUnknownConnectorName(t *testing.T) {
	h := NewUseCase(&stubRegistry{getFn: func(_ context.Context, _ string) (*registry.Connector, error) {
		return nil, nil
	}})

	_, err := h.Execute(context.Background(), "Attio")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "GetConnectorSettingsSchema.InvalidConnectorName", kaitenerrors.GetCode(err))
}

func TestHandler_Handle_ReturnsNotFoundForUnregisteredConnector(t *testing.T) {
	h := NewUseCase(&stubRegistry{getFn: func(_ context.Context, _ string) (*registry.Connector, error) {
		return nil, registry.ErrNotFound
	}})

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsNotFound(err))
	require.Equal(t, "GetConnectorSettingsSchema.NotRegistered", kaitenerrors.GetCode(err))
}
