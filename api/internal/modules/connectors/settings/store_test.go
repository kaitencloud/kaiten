package settings

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestStore_UpsertGetDelete_WithFakeVault(t *testing.T) {
	fakeFilePath := setupFakeVault(t)

	ctx := context.Background()
	store := NewStore("custom/connectors")
	orgID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	connectorName := "kaiten.integration.crm.attio"

	input := map[string]any{
		"enabled":          true,
		"attio_api_key":    "attio-key",
		"kaiten_api_url":   "https://api.kaiten.example",
		"kaiten_api_token": "kaiten-token",
	}

	err := store.Upsert(ctx, orgID, connectorName, input)
	require.NoError(t, err)

	got, err := store.Get(ctx, orgID, connectorName)
	require.NoError(t, err)
	require.Equal(t, input, got)

	persisted := readFakeVaultFile(t, fakeFilePath)
	storedPath := "custom/connectors/11111111-1111-1111-1111-111111111111/kaiten.integration.crm.attio/settings"
	require.Contains(t, persisted, storedPath)
	require.Equal(t, "attio-key", persisted[storedPath]["attio_api_key"])

	err = store.Delete(ctx, orgID, connectorName)
	require.NoError(t, err)

	_, err = store.Get(ctx, orgID, connectorName)
	require.ErrorIs(t, err, ErrNotFound)
}

func TestStore_UsesDefaultBasePathWhenEmpty(t *testing.T) {
	fakeFilePath := setupFakeVault(t)

	ctx := context.Background()
	store := NewStore("   ")
	orgID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	connectorName := "kaiten.integration.crm.attio"

	err := store.Upsert(ctx, orgID, connectorName, map[string]any{
		"attio_api_key":    "attio-key",
		"kaiten_api_url":   "https://api.kaiten.example",
		"kaiten_api_token": "kaiten-token",
	})
	require.NoError(t, err)

	persisted := readFakeVaultFile(t, fakeFilePath)
	defaultPath := "kaiten/connectors/22222222-2222-2222-2222-222222222222/kaiten.integration.crm.attio/settings"
	require.Contains(t, persisted, defaultPath)
}

func setupFakeVault(t *testing.T) string {
	t.Helper()

	fakeFilePath := filepath.Join(t.TempDir(), "vault-secrets.json")
	t.Setenv("VAULT_ADDR", "")
	t.Setenv("VAULT_TOKEN", "")
	t.Setenv("VAULT_FAKE_FILE_PATH", fakeFilePath)

	return fakeFilePath
}

func readFakeVaultFile(t *testing.T, filePath string) map[string]map[string]any {
	t.Helper()

	raw, err := os.ReadFile(filePath)
	require.NoError(t, err)

	store := make(map[string]map[string]any)
	err = json.Unmarshal(raw, &store)
	require.NoError(t, err)

	return store
}
