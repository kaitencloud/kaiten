package getsettings

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	connectorsettings "github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type stubUserProvider struct {
	user *currentuser.User
	err  error
}

func (s *stubUserProvider) GetUser(_ context.Context) (*currentuser.User, error) {
	if s.err != nil {
		return nil, s.err
	}

	return s.user, nil
}

type stubConnectorRegistry struct {
	connectors map[string]*registry.Connector
	err        error
}

func (s *stubConnectorRegistry) Get(_ context.Context, connectorName string) (*registry.Connector, error) {
	if s.err != nil {
		return nil, s.err
	}

	connector, found := s.connectors[connectorName]
	if !found {
		return nil, registry.ErrNotFound
	}

	return connector, nil
}

func TestHandler_Handle_PropagatesUserProviderError(t *testing.T) {
	h := newTestHandler(t, &stubUserProvider{err: errors.New("auth error")}, defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.EqualError(t, err, "auth error")
}

func TestHandler_Handle_ReturnsNotFoundWithoutSettings(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsNotFound(err))
	require.Equal(t, "GetConnectorSettings.NotFound", kaitenerrors.GetCode(err))
}

func TestHandler_Handle_RedactsWriteOnlyFields(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())
	seedStoredSettings(t)

	resp, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.NoError(t, err)
	require.Equal(t, "kaiten.integration.crm.attio", resp.ConnectorName)
	require.Equal(t, common.RedactedSecretValue, resp.Settings["attioApiKey"])
	require.Equal(t, "https://api.attio.example", resp.Settings["attioApiUrl"])
	require.Equal(t, "create-and-bind", resp.Settings["syncPolicy"])
}

func TestHandler_Handle_FailsClosedWhenConnectorNotRegistered(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), &stubConnectorRegistry{})
	seedStoredSettings(t)

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsNotFound(err))
	require.Equal(t, "GetConnectorSettings.NotRegistered", kaitenerrors.GetCode(err))
}

func newTestHandler(t *testing.T, userProvider currentuser.Provider, connectorRegistry registry.Reader) *UseCase {
	t.Helper()

	t.Setenv("VAULT_ADDR", "")
	t.Setenv("VAULT_TOKEN", "")
	t.Setenv("VAULT_FAKE_FILE_PATH", filepath.Join(t.TempDir(), "vault-secrets.json"))

	return NewHandlerWithRegistry(Deps{
		UserProvider:            userProvider,
		ConnectorsVaultBasePath: "kaiten/connectors",
	}, connectorRegistry)
}

func seedStoredSettings(t *testing.T) {
	t.Helper()

	store := connectorsettings.NewStore("kaiten/connectors")
	err := store.Upsert(context.Background(), defaultUserProvider().user.OrganizationID, "kaiten.integration.crm.attio", map[string]any{
		"attioApiKey": "attio-key",
		"attioApiUrl": "https://api.attio.example",
		"syncPolicy":  "create-and-bind",
		"fieldsMapping": map[string]any{
			"customer.name": "company_name",
		},
	})
	require.NoError(t, err)
}

func defaultUserProvider() *stubUserProvider {
	return &stubUserProvider{
		user: &currentuser.User{
			ID:             uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
			OrganizationID: uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		},
	}
}

func defaultConnectorRegistry() *stubConnectorRegistry {
	return &stubConnectorRegistry{
		connectors: map[string]*registry.Connector{
			"kaiten.integration.crm.attio": {
				Name:    "kaiten.integration.crm.attio",
				Version: "1.1.0",
				SettingsSchema: map[string]any{
					"$schema": "https://json-schema.org/draft/2020-12/schema",
					"type":    "object",
					"properties": map[string]any{
						"attioApiKey": map[string]any{"type": "string", "writeOnly": true},
						"attioApiUrl": map[string]any{"type": "string"},
						"syncPolicy":  map[string]any{"type": "string"},
						"fieldsMapping": map[string]any{
							"type": "object",
							"additionalProperties": map[string]any{
								"type": "string",
							},
						},
					},
					"required":             []string{"attioApiKey", "attioApiUrl", "syncPolicy", "fieldsMapping"},
					"additionalProperties": false,
				},
			},
		},
	}
}
