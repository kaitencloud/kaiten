package updatesettings

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	connectorsettings "github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type stubUserProvider struct {
	user *currentuser.User
	err  error
}

type stubConnectorRegistry struct {
	connectors map[string]*registry.Connector
	err        error
}

func (s *stubUserProvider) GetUser(_ context.Context) (*currentuser.User, error) {
	if s.err != nil {
		return nil, s.err
	}

	return s.user, nil
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

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{Settings: map[string]any{"foo": "bar"}})

	require.EqualError(t, err, "auth error")
}

func TestHandler_Handle_RejectsUnregisteredConnector(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.unknown", schema.ConnectorSettings{Settings: map[string]any{"foo": "bar"}})

	require.Error(t, err)
	require.True(t, kaitenerrors.IsNotFound(err))
	require.Equal(t, "UpdateConnectorSettings.NotRegistered", kaitenerrors.GetCode(err))
}

func TestHandler_Handle_RejectsEmptyPayload(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{Settings: map[string]any{}})

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "UpdateConnectorSettings.InvalidPayload", kaitenerrors.GetCode(err))
}

func TestHandler_Handle_RejectsSchemaInvalidPayload(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: map[string]any{
			"attioApiKey": "attio-key",
			"attioApiUrl": "https://api.attio.example",
			"syncPolicy":  "create-and-bind",
			"extraField":  "not-allowed",
		},
	})

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "UpdateConnectorSettings.InvalidPayloadSchema", kaitenerrors.GetCode(err))
}

func TestHandler_Handle_UpsertsSettingsAndReturnsNormalizedName(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	resp, err := h.Execute(context.Background(), "  KAITEN.INTEGRATION.CRM.ATTIO ", schema.ConnectorSettings{
		Settings: map[string]any{
			"attioApiKey": "attio-key",
			"attioApiUrl": "https://api.attio.example",
			"syncPolicy":  "create-and-bind",
			"fieldsMapping": map[string]any{
				"customer.name": "company_name",
			},
		},
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, "kaiten.integration.crm.attio", resp.ConnectorName)
	require.Equal(t, common.RedactedSecretValue, resp.Settings["attioApiKey"])
	require.Equal(t, "https://api.attio.example", resp.Settings["attioApiUrl"])
	require.Equal(t, "create-and-bind", resp.Settings["syncPolicy"])
	require.Equal(t, map[string]any{"customer.name": "company_name"}, resp.Settings["fieldsMapping"])

	// The plaintext secret must still be what gets stored.
	require.Equal(t, "attio-key", readStoredSettings(t)["attioApiKey"])
}

func TestHandler_Handle_OmittedSecretKeepsStoredValue(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: validSettings("attio-key"),
	})
	require.NoError(t, err)

	update := validSettings("")
	delete(update, "attioApiKey")
	resp, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: update,
	})

	require.NoError(t, err)
	require.Equal(t, common.RedactedSecretValue, resp.Settings["attioApiKey"])
	require.Equal(t, "attio-key", readStoredSettings(t)["attioApiKey"])
}

func TestHandler_Handle_RedactedSecretKeepsStoredValue(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: validSettings("attio-key"),
	})
	require.NoError(t, err)

	_, err = h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: validSettings(common.RedactedSecretValue),
	})

	require.NoError(t, err)
	require.Equal(t, "attio-key", readStoredSettings(t)["attioApiKey"])
}

func TestHandler_Handle_RotatesSecretWhenNewValueProvided(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: validSettings("attio-key"),
	})
	require.NoError(t, err)

	_, err = h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: validSettings("rotated-key"),
	})

	require.NoError(t, err)
	require.Equal(t, "rotated-key", readStoredSettings(t)["attioApiKey"])
}

func TestHandler_Handle_OmittedSecretWithoutStoredSettingsFails(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())

	initial := validSettings("")
	delete(initial, "attioApiKey")
	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: initial,
	})

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "UpdateConnectorSettings.InvalidPayloadSchema", kaitenerrors.GetCode(err))
}

func validSettings(apiKey string) map[string]any {
	return map[string]any{
		"attioApiKey": apiKey,
		"attioApiUrl": "https://api.attio.example",
		"syncPolicy":  "create-and-bind",
		"fieldsMapping": map[string]any{
			"customer.name": "company_name",
		},
	}
}

func readStoredSettings(t *testing.T) map[string]any {
	t.Helper()

	store := connectorsettings.NewStore("kaiten/connectors")
	stored, err := store.Get(context.Background(), defaultUserProvider().user.OrganizationID, "kaiten.integration.crm.attio")
	require.NoError(t, err)

	return stored
}

func newTestHandler(t *testing.T, userProvider currentuser.Provider, connectorRegistry registry.Reader) *UseCase {
	t.Helper()

	t.Setenv("VAULT_ADDR", "")
	t.Setenv("VAULT_TOKEN", "")
	t.Setenv("VAULT_FAKE_FILE_PATH", filepath.Join(t.TempDir(), "vault-secrets.json"))

	h := NewHandlerWithRegistry(Deps{
		UserProvider:            userProvider,
		ConnectorsVaultBasePath: "kaiten/connectors",
	}, connectorRegistry)

	// These tests are about the settings payload -- the secret merge, the schema
	// validation, the redaction on the way back -- so the activation this handler
	// composes is stubbed out. That composition has its own tests, and driving it
	// here would mean giving every one of them a database.
	h.activator = &recordingActivator{}

	return h
}

// recordingActivator stands in for activateconnector, recording what it was asked to
// activate so a test that cares can assert on it.
type recordingActivator struct {
	activated []string
	err       error
}

func (a *recordingActivator) Execute(_ context.Context, connectorName string) (*schema.ConnectorActivation, error) {
	a.activated = append(a.activated, connectorName)
	if a.err != nil {
		return nil, a.err
	}

	return &schema.ConnectorActivation{ConnectorName: connectorName}, nil
}

// Saving a connector's settings is how an organization turns it on, so this handler
// must leave the activation row exactly where the explicit endpoint would -- and must
// do it BEFORE writing the secret, so that an organization whose licence does not
// include the connector is refused without its API key having been stored.
func TestHandler_Handle_ActivatesTheConnectorBeforeStoringSettings(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())
	activator := &recordingActivator{}
	h.activator = activator

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: validAttioSettings(),
	})

	require.NoError(t, err)
	require.Equal(t, []string{"kaiten.integration.crm.attio"}, activator.activated)
}

func TestHandler_Handle_RefusesToStoreSettingsWhenActivationIsRefused(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())
	refusal := kaitenerrors.Forbidden("ActivateConnector.NotEntitled", "not licensed")
	h.activator = &recordingActivator{err: refusal}

	_, err := h.Execute(context.Background(), "kaiten.integration.crm.attio", schema.ConnectorSettings{
		Settings: validAttioSettings(),
	})

	require.ErrorIs(t, err, refusal)

	// The secret must not be in the store: a refusal that happened after the write
	// would tell the caller no while having already kept its credentials.
	stored, err := connectorsettings.NewStore("kaiten/connectors").
		Get(context.Background(), defaultUserProvider().user.OrganizationID, "kaiten.integration.crm.attio")
	require.ErrorIs(t, err, connectorsettings.ErrNotFound)
	require.Nil(t, stored)
}

func defaultUserProvider() *stubUserProvider {
	return &stubUserProvider{
		user: &currentuser.User{
			ID:             uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
			OrganizationID: uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		},
	}
}

func validAttioSettings() map[string]any {
	return map[string]any{
		"attioApiKey":   "secret",
		"attioApiUrl":   "https://api.attio.example",
		"syncPolicy":    "create-and-bind",
		"fieldsMapping": map[string]any{},
	}
}

func defaultConnectorRegistry() *stubConnectorRegistry {
	return &stubConnectorRegistry{
		connectors: map[string]*registry.Connector{
			"kaiten.integration.crm.attio": {
				Name:    "kaiten.integration.crm.attio",
				Version: "1.0.0",
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
