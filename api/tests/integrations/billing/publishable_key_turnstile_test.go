package billing_test

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestPublishableKeyTurnstile: a key opens the anonymous checkout only with a
// Turnstile site key and secret; the secret lives in Vault, is never returned,
// and goes when it is cleared or the key is revoked (V32-01, §13.12).
func TestPublishableKeyTurnstile(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	t.Setenv("VAULT_ADDR", "")
	t.Setenv("VAULT_FAKE_FILE_PATH", "")
	const secret = "0x4AAAAAAA-turnstile-secret-for-tests"
	draft := map[string]any{"label": "Pricing page", "allowedOrigins": []string{storefront},
		"anonymousCheckout": true, "turnstileSiteKey": "0x4AAAAAAAsite", "turnstileSecret": secret}

	require.Equal(t, "CreatePublishableKey.VaultNotConfigured",
		problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/publishable-keys", draft), "no Vault, no secret")

	vaultFile := filepath.Join(t.TempDir(), "vault.json")
	t.Setenv("VAULT_FAKE_FILE_PATH", vaultFile)
	inVault := func() bool {
		t.Helper()
		raw, err := os.ReadFile(vaultFile)
		if os.IsNotExist(err) {
			return false
		}
		require.NoError(t, err)
		return strings.Contains(string(raw), secret)
	}

	require.Equal(t, "CreatePublishableKey.TurnstileNotConfigured", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/publishable-keys",
		map[string]any{"label": "Pricing page", "allowedOrigins": []string{}, "anonymousCheckout": true, "turnstileSiteKey": "0x4AAAAAAAsite"}))

	resp := call(t, "POST", "/api/publishable-keys", draft)
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusCreated, resp.StatusCode, string(raw))
	require.NotContains(t, string(raw), secret, "the secret is never returned")
	var created keys.PublishableKeyCreated
	require.NoError(t, json.Unmarshal(raw, &created))
	require.True(t, created.AnonymousCheckout)
	require.Equal(t, "0x4AAAAAAAsite", *created.TurnstileSiteKey)
	require.True(t, created.TurnstileSecretConfigured)
	require.True(t, inVault())
	path := "/api/publishable-keys/" + created.ID.String()

	require.Equal(t, "UpdatePublishableKey.TurnstileNotConfigured", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH", path,
		map[string]any{"turnstileSiteKey": ""}), "clearing a value while anonymousCheckout is on")
	closed := commonfixture.AssertJSONResponse[keys.PublishableKey](t, call(t, "PATCH", path,
		map[string]any{"anonymousCheckout": false, "turnstileSecret": ""}), fiber.StatusOK)
	require.False(t, closed.AnonymousCheckout)
	require.False(t, closed.TurnstileSecretConfigured)
	require.Equal(t, "0x4AAAAAAAsite", *closed.TurnstileSiteKey, "an absent member keeps the stored value")
	require.False(t, inVault(), "a cleared secret leaves Vault")

	reopened := commonfixture.AssertJSONResponse[keys.PublishableKey](t, call(t, "PATCH", path,
		map[string]any{"anonymousCheckout": true, "turnstileSecret": secret}), fiber.StatusOK)
	require.True(t, reopened.AnonymousCheckout)
	require.True(t, reopened.TurnstileSecretConfigured)
	require.True(t, inVault())

	revoked := commonfixture.AssertJSONResponse[keys.PublishableKey](t, call(t, "POST", path+"/revoke", nil), fiber.StatusOK)
	require.False(t, revoked.TurnstileSecretConfigured)
	require.False(t, inVault(), "the secret goes with the key")

	plain := newPublishableKey(t)
	require.False(t, plain.AnonymousCheckout)
	require.Nil(t, plain.TurnstileSiteKey)
	require.False(t, plain.TurnstileSecretConfigured)
}
