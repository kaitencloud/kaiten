package updatesettings

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/connectorhooks"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	connectorsettings "github.com/kaitencloud/kaiten/api/internal/modules/connectors/settings"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// validatingHooks records what ValidateSettings saw, and refuses when told to.
type validatingHooks struct {
	merged, stored []map[string]any
	err            error
}

func (h *validatingHooks) ValidateSettings(_ context.Context, _ uuid.UUID, merged, stored map[string]any) error {
	h.merged = append(h.merged, merged)
	h.stored = append(h.stored, stored)
	return h.err
}
func (*validatingHooks) CanDeactivate(context.Context, uuid.UUID, string) error       { return nil }
func (*validatingHooks) Activated(context.Context, uuid.UUID, map[string]any) error   { return nil }
func (*validatingHooks) Deactivated(context.Context, uuid.UUID, map[string]any) error { return nil }

const attio = "kaiten.integration.crm.attio"

// A connector's own validation refuses before anything is written: no
// activation, no stored secret.
func TestHandler_Handle_ConnectorValidationRefusesBeforeAnyWrite(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())
	refusal := kaitenerrors.UnprocessableEntity("UpdateConnectorSettings.CredentialsRejected", "refused")
	connectorHooks := &validatingHooks{err: refusal}
	h.deps.Hooks = connectorhooks.Registry{attio: connectorHooks}
	activator := &recordingActivator{}
	h.activator = activator

	_, err := h.Execute(context.Background(), attio, schema.ConnectorSettings{Settings: validAttioSettings()})

	require.ErrorIs(t, err, refusal)
	require.Empty(t, activator.activated)
	_, err = connectorsettings.NewStore("kaiten/connectors").Get(context.Background(), defaultUserProvider().user.OrganizationID, attio)
	require.ErrorIs(t, err, connectorsettings.ErrNotFound)
	require.Len(t, connectorHooks.merged, 1)
	require.Nil(t, connectorHooks.stored[0], "a first configuration has nothing stored")
}

// The hook sees the settings after the write-only fields are merged, and the
// ones stored before.
func TestHandler_Handle_ConnectorValidationSeesMergedAndStoredSettings(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())
	connectorHooks := &validatingHooks{}
	h.deps.Hooks = connectorhooks.Registry{attio: connectorHooks}

	_, err := h.Execute(context.Background(), attio, schema.ConnectorSettings{Settings: validAttioSettings()})
	require.NoError(t, err)

	update := validAttioSettings()
	delete(update, "attioApiKey") // keep the stored key
	update["syncPolicy"] = "fail-and-retry"
	_, err = h.Execute(context.Background(), attio, schema.ConnectorSettings{Settings: update})
	require.NoError(t, err)

	require.Len(t, connectorHooks.merged, 2)
	require.Equal(t, "secret", connectorHooks.merged[1]["attioApiKey"], "the stored secret is merged in")
	require.Equal(t, "fail-and-retry", connectorHooks.merged[1]["syncPolicy"])
	require.Equal(t, "create-and-bind", connectorHooks.stored[1]["syncPolicy"], "stored is what was there before")
}

// The activation's own refusals come before the connector's validation, so an
// organization that may not use the connector never reaches its provider.
func TestHandler_Handle_ActivationRefusalComesBeforeConnectorValidation(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())
	connectorHooks := &validatingHooks{}
	h.deps.Hooks = connectorhooks.Registry{attio: connectorHooks}
	refusal := kaitenerrors.Forbidden("ActivateConnector.NotEntitled", "not licensed")
	h.activator = &recordingActivator{err: refusal}

	_, err := h.Execute(context.Background(), attio, schema.ConnectorSettings{Settings: validAttioSettings()})

	require.ErrorIs(t, err, refusal)
	require.Empty(t, connectorHooks.merged)
}

// Without Vault, a connector with settings is refused with a code of its own,
// before any read of the store.
func TestHandler_Handle_RefusesWithoutVault(t *testing.T) {
	h := newTestHandler(t, defaultUserProvider(), defaultConnectorRegistry())
	t.Setenv("VAULT_FAKE_FILE_PATH", "")

	_, err := h.Execute(context.Background(), attio, schema.ConnectorSettings{Settings: validAttioSettings()})

	require.Equal(t, "UpdateConnectorSettings.VaultNotConfigured", kaitenerrors.GetCode(err))
}
