package vault

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	vault "github.com/hashicorp/vault-client-go"
	"github.com/hashicorp/vault-client-go/schema"

	"github.com/kaitencloud/kaiten/api/pkg/secretfile"
)

const (
	defaultJWTPath           = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	kvV1MountPath            = "secret"
	defaultFakeVaultFilePerm = 0o600
)

// Client writes and reads Vault KV v1 secrets using the official Vault client.
// secretPath is the relative path under the fixed "secret" mount, for example
// "demo/kaiten/dogfooding".
type Client struct {
	secretPath string
	k8sRole    string
	jwtPath    string
	token      string
	fakePath   string
	client     *vault.Client
}

// NewClient creates a Vault client from environment variables.
func NewClient() (*Client, error) {
	return NewClientForPath(os.Getenv("VAULT_SECRET_PATH"))
}

// Configured reports whether this process can reach a Vault at all: a real one
// (VAULT_ADDR) or the development file store (VAULT_FAKE_FILE_PATH). Without
// either, nothing can store connector settings, and a feature that needs them
// should say so rather than fail inside the client.
func Configured() bool {
	return strings.TrimSpace(os.Getenv("VAULT_ADDR")) != "" || strings.TrimSpace(os.Getenv("VAULT_FAKE_FILE_PATH")) != ""
}

// NewClientForPath creates a Vault client from environment variables and an explicit KV path.
func NewClientForPath(secretPath string) (*Client, error) {
	if secretPath == "" {
		return nil, fmt.Errorf("vault: VAULT_SECRET_PATH is required")
	}

	addr := strings.TrimRight(os.Getenv("VAULT_ADDR"), "/")
	fakePath := strings.TrimSpace(os.Getenv("VAULT_FAKE_FILE_PATH"))
	if !Configured() {
		return nil, fmt.Errorf("vault: either VAULT_ADDR or VAULT_FAKE_FILE_PATH is required")
	}

	if fakePath != "" {
		return &Client{
			secretPath: secretPath,
			fakePath:   fakePath,
		}, nil
	}

	role := os.Getenv("VAULT_K8S_ROLE")
	if role == "" {
		role = "seeder-demo"
	}

	client, err := vault.New(
		vault.WithAddress(addr),
		vault.WithEnvironment(),
		vault.WithRequestTimeout(30*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("vault: init client: %w", err)
	}

	return &Client{
		secretPath: secretPath,
		k8sRole:    role,
		jwtPath:    defaultJWTPath,
		token:      strings.TrimSpace(os.Getenv("VAULT_TOKEN")),
		fakePath:   fakePath,
		client:     client,
	}, nil
}

// WriteSecret merges key-value pairs into the configured KV v1 path.
// KV v1 has no patch endpoint, so this performs a read-merge-write to preserve sibling keys.
func (c *Client) WriteSecret(ctx context.Context, data map[string]string) error {
	payload := make(map[string]any, len(data))
	for key, value := range data {
		payload[key] = value
	}

	return c.WriteSecretAny(ctx, payload)
}

// ReadSecret reads the KV v1 path configured by VAULT_SECRET_PATH and returns its string values.
func (c *Client) ReadSecret(ctx context.Context) (map[string]string, error) {
	raw, err := c.ReadSecretAny(ctx)
	if err != nil {
		return nil, err
	}

	data := make(map[string]string, len(raw))
	for key, value := range raw {
		data[key] = fmt.Sprint(value)
	}

	return data, nil
}

// WriteSecretAny merges key-value pairs into the configured secret path.
func (c *Client) WriteSecretAny(ctx context.Context, data map[string]any) error {
	return c.WriteSecretAnyAtPath(ctx, c.secretPath, data)
}

// WriteSecretAnyAtPath merges key-value pairs into an arbitrary secret path.
// KV v1 has no patch endpoint, so this performs a read-merge-write to preserve sibling keys.
func (c *Client) WriteSecretAnyAtPath(ctx context.Context, secretPath string, data map[string]any) error {
	normalizedPath, err := normalizeSecretPath(secretPath)
	if err != nil {
		return err
	}

	existing, err := c.ReadSecretAnyAtPath(ctx, normalizedPath)
	if err != nil {
		return err
	}

	merged := make(map[string]any, len(existing)+len(data))
	for key, value := range existing {
		merged[key] = value
	}
	for key, value := range data {
		merged[key] = value
	}

	if c.fakePath != "" {
		return c.writeFakeSecret(normalizedPath, merged)
	}

	if err := c.ensureToken(ctx); err != nil {
		return err
	}

	if _, err := c.client.Secrets.KvV1Write(ctx, normalizedPath, merged, vault.WithMountPath(kvV1MountPath)); err != nil {
		return fmt.Errorf("vault: write secret: %w", err)
	}

	return nil
}

// ReadSecretAny reads the configured secret path and returns all fields.
func (c *Client) ReadSecretAny(ctx context.Context) (map[string]any, error) {
	return c.ReadSecretAnyAtPath(ctx, c.secretPath)
}

// ReadSecretAnyAtPath reads an arbitrary secret path and returns all fields.
func (c *Client) ReadSecretAnyAtPath(ctx context.Context, secretPath string) (map[string]any, error) {
	normalizedPath, err := normalizeSecretPath(secretPath)
	if err != nil {
		return nil, err
	}

	if c.fakePath != "" {
		return c.readFakeSecret(normalizedPath)
	}

	if err := c.ensureToken(ctx); err != nil {
		return nil, err
	}

	resp, err := c.client.Secrets.KvV1Read(ctx, normalizedPath, vault.WithMountPath(kvV1MountPath))
	if err != nil {
		if vault.IsErrorStatus(err, http.StatusNotFound) {
			return map[string]any{}, nil
		}
		return nil, fmt.Errorf("vault: read secret: %w", err)
	}

	if resp == nil || resp.Data == nil {
		return map[string]any{}, nil
	}

	data := make(map[string]any, len(resp.Data))
	for key, value := range resp.Data {
		data[key] = value
	}

	return data, nil
}

// DeleteSecret removes the configured secret path.
func (c *Client) DeleteSecret(ctx context.Context) error {
	return c.DeleteSecretAtPath(ctx, c.secretPath)
}

// DeleteSecretAtPath removes an arbitrary secret path.
func (c *Client) DeleteSecretAtPath(ctx context.Context, secretPath string) error {
	normalizedPath, err := normalizeSecretPath(secretPath)
	if err != nil {
		return err
	}

	if c.fakePath != "" {
		return c.deleteFakeSecret(normalizedPath)
	}

	if err := c.ensureToken(ctx); err != nil {
		return err
	}

	if _, err := c.client.Secrets.KvV1Delete(ctx, normalizedPath, vault.WithMountPath(kvV1MountPath)); err != nil {
		if vault.IsErrorStatus(err, http.StatusNotFound) {
			return nil
		}
		return fmt.Errorf("vault: delete secret: %w", err)
	}

	return nil
}

func (c *Client) ensureToken(ctx context.Context) error {
	if c.fakePath != "" {
		return nil
	}

	if c.token != "" {
		return c.client.SetToken(c.token)
	}

	jwt, err := secretfile.Read(c.jwtPath)
	if err != nil {
		return fmt.Errorf("vault: read service account JWT: %w", err)
	}

	resp, err := c.client.Auth.KubernetesLogin(ctx, schema.KubernetesLoginRequest{
		Role: c.k8sRole,
		Jwt:  jwt,
	})
	if err != nil {
		return fmt.Errorf("vault: kubernetes login: %w", err)
	}
	if resp == nil || resp.Auth == nil || strings.TrimSpace(resp.Auth.ClientToken) == "" {
		return fmt.Errorf("vault: login response contained no client_token")
	}

	c.token = resp.Auth.ClientToken
	return c.client.SetToken(c.token)
}

func normalizeSecretPath(secretPath string) (string, error) {
	cleaned := strings.Trim(strings.TrimSpace(secretPath), "/")
	if cleaned == "" {
		return "", fmt.Errorf("vault: secret path is empty")
	}

	return cleaned, nil
}

func (c *Client) readFakeSecret(secretPath string) (map[string]any, error) {
	store, err := c.readFakeStore()
	if err != nil {
		return nil, err
	}

	data, ok := store[secretPath]
	if !ok || data == nil {
		return map[string]any{}, nil
	}

	return cloneMap(data), nil
}

func (c *Client) writeFakeSecret(secretPath string, data map[string]any) error {
	store, err := c.readFakeStore()
	if err != nil {
		return err
	}

	store[secretPath] = cloneMap(data)

	return c.writeFakeStore(store)
}

func (c *Client) deleteFakeSecret(secretPath string) error {
	store, err := c.readFakeStore()
	if err != nil {
		return err
	}

	delete(store, secretPath)

	return c.writeFakeStore(store)
}

func (c *Client) readFakeStore() (map[string]map[string]any, error) {
	if strings.TrimSpace(c.fakePath) == "" {
		return nil, fmt.Errorf("vault: VAULT_FAKE_FILE_PATH is empty")
	}

	raw, err := os.ReadFile(c.fakePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]map[string]any{}, nil
		}
		return nil, fmt.Errorf("vault: read fake file: %w", err)
	}

	if len(strings.TrimSpace(string(raw))) == 0 {
		return map[string]map[string]any{}, nil
	}

	store := make(map[string]map[string]any)
	if err := json.Unmarshal(raw, &store); err != nil {
		return nil, fmt.Errorf("vault: decode fake file: %w", err)
	}

	return store, nil
}

func (c *Client) writeFakeStore(store map[string]map[string]any) error {
	if strings.TrimSpace(c.fakePath) == "" {
		return fmt.Errorf("vault: VAULT_FAKE_FILE_PATH is empty")
	}

	if err := os.MkdirAll(filepath.Dir(c.fakePath), 0o755); err != nil {
		return fmt.Errorf("vault: create fake file directory: %w", err)
	}

	payload, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("vault: encode fake file: %w", err)
	}

	tmpPath := c.fakePath + ".tmp"
	if err := os.WriteFile(tmpPath, payload, defaultFakeVaultFilePerm); err != nil {
		return fmt.Errorf("vault: write fake file tmp: %w", err)
	}

	if err := os.Rename(tmpPath, c.fakePath); err != nil {
		return fmt.Errorf("vault: replace fake file: %w", err)
	}

	return nil
}

func cloneMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}

	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}

	return cloned
}
