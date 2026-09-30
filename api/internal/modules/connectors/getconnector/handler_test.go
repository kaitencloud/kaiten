package getconnector

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

func TestHandle_ReturnsConnector(t *testing.T) {
	h := NewUseCase(&stubRegistry{getFn: func(_ context.Context, name string) (*registry.Connector, error) {
		now := time.Now()
		return &registry.Connector{
			Name:    name,
			Version: "1.0.0",
			SettingsSchema: map[string]any{
				"type": "object",
			},
			CreatedAt: now,
			UpdatedAt: now,
		}, nil
	}})

	result, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "kaiten.integration.crm.attio", result.Name)
	require.Equal(t, "1.0.0", result.Version)
}

func TestHandle_ReturnsNotFoundForUnregisteredConnector(t *testing.T) {
	h := NewUseCase(&stubRegistry{getFn: func(_ context.Context, _ string) (*registry.Connector, error) {
		return nil, registry.ErrNotFound
	}})

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsNotFound(err))
	require.Equal(t, "GetConnector.NotFound", kaitenerrors.GetCode(err))
}

// The gate itself, carried on a read. activateconnector refuses activation unless
// the organization's licence grants this slug, so a read that dropped it described
// a connector anyone may activate -- and POST /connectors, which returns the field,
// described the same connector as gated.
func TestHandle_CarriesTheEntitlementSlug(t *testing.T) {
	slug := "connector-attio"
	h := NewUseCase(&stubRegistry{getFn: func(_ context.Context, name string) (*registry.Connector, error) {
		return &registry.Connector{Name: name, Version: "1.0.0", EntitlementSlug: &slug}, nil
	}})

	result, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.NoError(t, err)
	require.NotNil(t, result.EntitlementSlug)
	require.Equal(t, slug, *result.EntitlementSlug)

	// Nil is the ungated connector, and has to stay distinguishable from it.
	h = NewUseCase(&stubRegistry{getFn: func(_ context.Context, name string) (*registry.Connector, error) {
		return &registry.Connector{Name: name, Version: "1.0.0"}, nil
	}})

	result, err = h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.NoError(t, err)
	require.Nil(t, result.EntitlementSlug)
}
