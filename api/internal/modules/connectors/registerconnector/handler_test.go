package registerconnector

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
	upsertFn func(ctx context.Context, input registry.UpsertInput) (*registry.Connector, error)
}

func (s *stubRegistry) Get(_ context.Context, _ string) (*registry.Connector, error) {
	return nil, registry.ErrNotFound
}

func (s *stubRegistry) Upsert(ctx context.Context, input registry.UpsertInput) (*registry.Connector, error) {
	if s.upsertFn == nil {
		return nil, errors.New("upsert function not configured")
	}
	return s.upsertFn(ctx, input)
}

func TestHandle_RegistersConnector(t *testing.T) {
	h := NewUseCase(&stubRegistry{upsertFn: func(_ context.Context, input registry.UpsertInput) (*registry.Connector, error) {
		now := time.Now()
		return &registry.Connector{
			Name:           input.Name,
			Version:        input.Version,
			SettingsSchema: input.SettingsSchema,
			CreatedAt:      now,
			UpdatedAt:      now,
		}, nil
	}})

	result, err := h.Execute(context.Background(), RegisterConnectorBody{
		Name:    "  KAITEN.INTEGRATION.CRM.ATTIO ",
		Version: "1.0.0",
		SettingsSchema: map[string]any{
			"type": "object",
		},
	})

	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "kaiten.integration.crm.attio", result.Name)
	require.Equal(t, "1.0.0", result.Version)
}

// The entitlement slug is what a license is later checked against, so "absent" and
// "present but blank" must not be two things: a lookup for the entitlement named ""
// would fail, turning a connector nobody meant to gate into one nobody can activate.
func TestHandle_NormalisesTheEntitlementSlug(t *testing.T) {
	var captured registry.UpsertInput
	h := NewUseCase(&stubRegistry{upsertFn: func(_ context.Context, input registry.UpsertInput) (*registry.Connector, error) {
		captured = input
		now := time.Now()
		return &registry.Connector{
			Name:            input.Name,
			Version:         input.Version,
			SettingsSchema:  input.SettingsSchema,
			EntitlementSlug: input.EntitlementSlug,
			CreatedAt:       now,
			UpdatedAt:       now,
		}, nil
	}})

	register := func(t *testing.T, slug *string) *registry.UpsertInput {
		t.Helper()
		_, err := h.Execute(context.Background(), RegisterConnectorBody{
			Name:            "kaiten.integration.crm.attio",
			Version:         "1.0.0",
			SettingsSchema:  map[string]any{"type": "object"},
			EntitlementSlug: slug,
		})
		require.NoError(t, err)
		return &captured
	}

	t.Run("absent stays absent, which is ungated", func(t *testing.T) {
		require.Nil(t, register(t, nil).EntitlementSlug)
	})

	t.Run("blank folds into absent", func(t *testing.T) {
		blank := "   "
		require.Nil(t, register(t, &blank).EntitlementSlug)
	})

	t.Run("a real slug is trimmed and kept", func(t *testing.T) {
		slug := "  connector-attio "
		require.Equal(t, "connector-attio", *register(t, &slug).EntitlementSlug)
	})
}

func TestHandle_RejectsInvalidSchema(t *testing.T) {
	h := NewUseCase(&stubRegistry{upsertFn: func(_ context.Context, _ registry.UpsertInput) (*registry.Connector, error) {
		return nil, nil
	}})

	_, err := h.Execute(context.Background(), RegisterConnectorBody{
		Name:    "kaiten.integration.crm.attio",
		Version: "1.0.0",
		SettingsSchema: map[string]any{
			"type": "invalid",
		},
	})

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "RegisterConnector.InvalidSchema", kaitenerrors.GetCode(err))
}

func TestHandle_ReturnsInternalWhenRepositoryFails(t *testing.T) {
	h := NewUseCase(&stubRegistry{upsertFn: func(_ context.Context, _ registry.UpsertInput) (*registry.Connector, error) {
		return nil, errors.New("db unavailable")
	}})

	_, err := h.Execute(context.Background(), RegisterConnectorBody{
		Name:    "kaiten.integration.crm.attio",
		Version: "1.0.0",
		SettingsSchema: map[string]any{
			"type": "object",
		},
	})

	require.Error(t, err)
	require.Equal(t, "RegisterConnector.UpsertFailed", kaitenerrors.GetCode(err))
}
