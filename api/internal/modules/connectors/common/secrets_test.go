package common

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func secretSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"attioApiKey": map[string]any{"type": "string", "writeOnly": true},
			"attioApiUrl": map[string]any{"type": "string"},
			"syncPolicy":  map[string]any{"type": "string", "writeOnly": false},
			"malformed":   "not-an-object",
		},
	}
}

func TestSecretFields_CollectsWriteOnlyProperties(t *testing.T) {
	require.Equal(t, []string{"attioApiKey"}, SecretFields(secretSchema()))
}

func TestSecretFields_ReturnsNilWithoutProperties(t *testing.T) {
	require.Nil(t, SecretFields(map[string]any{"type": "object"}))
}

func TestRedactSecrets_ReplacesConfiguredSecrets(t *testing.T) {
	redacted := RedactSecrets(map[string]any{
		"attioApiKey": "attio-key",
		"attioApiUrl": "https://api.attio.example",
	}, []string{"attioApiKey"})

	require.Equal(t, RedactedSecretValue, redacted["attioApiKey"])
	require.Equal(t, "https://api.attio.example", redacted["attioApiUrl"])
}

func TestRedactSecrets_KeepsAbsentAndEmptySecrets(t *testing.T) {
	redacted := RedactSecrets(map[string]any{
		"attioApiUrl": "https://api.attio.example",
		"emptyKey":    "",
	}, []string{"attioApiKey", "emptyKey"})

	require.NotContains(t, redacted, "attioApiKey")
	require.Equal(t, "", redacted["emptyKey"])
}

func TestRedactSecrets_DoesNotMutateInput(t *testing.T) {
	settings := map[string]any{"attioApiKey": "attio-key"}

	RedactSecrets(settings, []string{"attioApiKey"})

	require.Equal(t, "attio-key", settings["attioApiKey"])
}

func TestMergeStoredSecrets_RestoresOmittedSecret(t *testing.T) {
	merged := MergeStoredSecrets(
		map[string]any{"attioApiUrl": "https://api.attio.example"},
		map[string]any{"attioApiKey": "stored-key"},
		[]string{"attioApiKey"},
	)

	require.Equal(t, "stored-key", merged["attioApiKey"])
	require.Equal(t, "https://api.attio.example", merged["attioApiUrl"])
}

func TestMergeStoredSecrets_RestoresRedactedAndEmptySecret(t *testing.T) {
	for _, value := range []any{RedactedSecretValue, "", nil} {
		merged := MergeStoredSecrets(
			map[string]any{"attioApiKey": value},
			map[string]any{"attioApiKey": "stored-key"},
			[]string{"attioApiKey"},
		)

		require.Equal(t, "stored-key", merged["attioApiKey"])
	}
}

func TestMergeStoredSecrets_KeepsNewSecretValue(t *testing.T) {
	merged := MergeStoredSecrets(
		map[string]any{"attioApiKey": "rotated-key"},
		map[string]any{"attioApiKey": "stored-key"},
		[]string{"attioApiKey"},
	)

	require.Equal(t, "rotated-key", merged["attioApiKey"])
}

func TestMergeStoredSecrets_NoopWithoutStoredSettings(t *testing.T) {
	incoming := map[string]any{"attioApiUrl": "https://api.attio.example"}

	merged := MergeStoredSecrets(incoming, nil, []string{"attioApiKey"})

	require.Equal(t, incoming, merged)
	require.NotContains(t, merged, "attioApiKey")
}
