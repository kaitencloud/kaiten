package settings

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/vault"
)

const defaultConnectorsBasePath = "kaiten/connectors"

var ErrNotFound = errors.New("connector settings not found")

type Store struct {
	basePath string
}

func NewStore(basePath string) *Store {
	trimmed := strings.Trim(strings.TrimSpace(basePath), "/")
	if trimmed == "" {
		trimmed = defaultConnectorsBasePath
	}

	return &Store{basePath: trimmed}
}

func (s *Store) Get(ctx context.Context, organizationID uuid.UUID, connectorName string) (map[string]any, error) {
	client, err := vault.NewClientForPath(s.secretPath(organizationID, connectorName))
	if err != nil {
		return nil, err
	}

	data, err := client.ReadSecretAny(ctx)
	if err != nil {
		return nil, err
	}

	if len(data) == 0 {
		return nil, ErrNotFound
	}

	return cloneMap(data), nil
}

func (s *Store) Upsert(ctx context.Context, organizationID uuid.UUID, connectorName string, data map[string]any) error {
	client, err := vault.NewClientForPath(s.secretPath(organizationID, connectorName))
	if err != nil {
		return err
	}

	return client.WriteSecretAny(ctx, cloneMap(data))
}

func (s *Store) Delete(ctx context.Context, organizationID uuid.UUID, connectorName string) error {
	client, err := vault.NewClientForPath(s.secretPath(organizationID, connectorName))
	if err != nil {
		return err
	}

	return client.DeleteSecret(ctx)
}

func (s *Store) secretPath(organizationID uuid.UUID, connectorName string) string {
	return fmt.Sprintf("%s/%s/%s/settings", s.basePath, organizationID.String(), strings.TrimSpace(connectorName))
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
