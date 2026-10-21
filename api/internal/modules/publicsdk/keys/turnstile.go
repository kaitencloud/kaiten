package keys

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/vault"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ErrNoTurnstileSecret is a key with no Turnstile secret in Vault.
var ErrNoTurnstileSecret = errors.New("publishable key: no Turnstile secret")

// SecretStore holds the Turnstile secret of each key (§13.12): never in the
// database, never returned, never logged.
type SecretStore interface {
	Put(ctx context.Context, organizationID, keyID uuid.UUID, secret string) error
	Get(ctx context.Context, organizationID, keyID uuid.UUID) (string, error)
	Delete(ctx context.Context, organizationID, keyID uuid.UUID) error
	// Configured reports whether a Vault is reachable at all; without one no
	// secret can be stored, so a key cannot offer anonymous checkout.
	Configured() bool
}

// VaultSecretStore keeps the secrets in Vault KV, beside the connectors'
// settings, at <base>/<organization>/publishable-keys/<key>/turnstile.
type VaultSecretStore struct{ basePath string }

const defaultSecretBasePath = "kaiten/connectors"

// NewVaultSecretStore stores under basePath, the connectors' Vault base.
func NewVaultSecretStore(basePath string) *VaultSecretStore {
	trimmed := strings.Trim(strings.TrimSpace(basePath), "/")
	if trimmed == "" {
		trimmed = defaultSecretBasePath
	}
	return &VaultSecretStore{basePath: trimmed}
}

func (s *VaultSecretStore) path(organizationID, keyID uuid.UUID) string {
	return fmt.Sprintf("%s/%s/publishable-keys/%s/turnstile", s.basePath, organizationID, keyID)
}

func (s *VaultSecretStore) Configured() bool { return vault.Configured() }

func (s *VaultSecretStore) Put(ctx context.Context, organizationID, keyID uuid.UUID, secret string) error {
	client, err := vault.NewClientForPath(s.path(organizationID, keyID))
	if err != nil {
		return err
	}
	return client.WriteSecretAny(ctx, map[string]any{"secret": secret})
}

func (s *VaultSecretStore) Get(ctx context.Context, organizationID, keyID uuid.UUID) (string, error) {
	client, err := vault.NewClientForPath(s.path(organizationID, keyID))
	if err != nil {
		return "", err
	}
	data, err := client.ReadSecretAny(ctx)
	if err != nil {
		return "", err
	}
	secret, _ := data["secret"].(string)
	if secret == "" {
		return "", ErrNoTurnstileSecret
	}
	return secret, nil
}

func (s *VaultSecretStore) Delete(ctx context.Context, organizationID, keyID uuid.UUID) error {
	client, err := vault.NewClientForPath(s.path(organizationID, keyID))
	if err != nil {
		return err
	}
	return client.DeleteSecret(ctx)
}

// RequireTurnstile is the rule a key's state must hold after any write: a key
// that offers anonymous checkout has both a site key and a secret (§13.12).
func RequireTurnstile(operation string, anonymousCheckout, hasSiteKey, hasSecret bool) error {
	if anonymousCheckout && (!hasSiteKey || !hasSecret) {
		return kaitenerrors.UnprocessableEntity(operation+".TurnstileNotConfigured",
			"anonymousCheckout needs a Turnstile site key and a Turnstile secret")
	}
	return nil
}

// RequireVault refuses a Turnstile secret on a deployment without Vault, as
// connector settings are refused (§12.3).
func RequireVault(operation string, store SecretStore) error {
	if store != nil && store.Configured() {
		return nil
	}
	return kaitenerrors.UnprocessableEntity(operation+".VaultNotConfigured",
		"The Turnstile secret is stored in Vault, and this deployment has none configured: set VAULT_ADDR")
}
