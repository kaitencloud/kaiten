package common

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/vault"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// RequireVault refuses, with <operation>.VaultNotConfigured, to activate or
// configure a connector that stores settings on a deployment without Vault:
// its settings could never be stored, so the connector could never work, and
// the failure would otherwise surface as an opaque error inside the Vault
// client. A connector without settings needs no Vault.
func RequireVault(operation string, settingsSchema map[string]any) error {
	if !HasSettings(settingsSchema) || vault.Configured() {
		return nil
	}
	return kaitenerrors.UnprocessableEntity(operation+".VaultNotConfigured",
		"This connector stores its settings in Vault, and this deployment has none configured: set VAULT_ADDR")
}
