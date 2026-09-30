package common

import (
	"testing"

	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func validSettingsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"apiKey": map[string]any{"type": "string"},
		},
		"required": []any{"apiKey"},
	}
}

func TestValidateSettingsSchema_AcceptsValidSchema(t *testing.T) {
	err := ValidateSettingsSchema(validSettingsSchema(), "RegisterConnector.InvalidSchema")

	require.NoError(t, err)
}

func TestValidateSettingsSchema_RejectsEmptySchema(t *testing.T) {
	err := ValidateSettingsSchema(map[string]any{}, "RegisterConnector.InvalidSchema")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "RegisterConnector.InvalidSchema", kaitenerrors.GetCode(err))
}

func TestValidateSettingsSchema_RejectsMalformedSchema(t *testing.T) {
	// "type" must be a string keyword, not an object -- not valid JSON Schema.
	err := ValidateSettingsSchema(map[string]any{"type": map[string]any{"nested": true}}, "RegisterConnector.InvalidSchema")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
}

func TestValidateConnectorSettings_AcceptsMatchingSettings(t *testing.T) {
	err := ValidateConnectorSettings(
		"kaiten.integration.crm.attio",
		validSettingsSchema(),
		map[string]any{"apiKey": "secret"},
		"UpdateConnectorSettings.InvalidPayloadSchema",
	)

	require.NoError(t, err)
}

func TestValidateConnectorSettings_RejectsMissingRequiredProperty(t *testing.T) {
	err := ValidateConnectorSettings(
		"kaiten.integration.crm.attio",
		validSettingsSchema(),
		map[string]any{},
		"UpdateConnectorSettings.InvalidPayloadSchema",
	)

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "UpdateConnectorSettings.InvalidPayloadSchema", kaitenerrors.GetCode(err))
}

func TestValidateConnectorSettings_RejectsWrongType(t *testing.T) {
	err := ValidateConnectorSettings(
		"kaiten.integration.crm.attio",
		validSettingsSchema(),
		map[string]any{"apiKey": 12345},
		"UpdateConnectorSettings.InvalidPayloadSchema",
	)

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
}

func TestValidateConnectorSettings_RejectsInvalidSchemaItself(t *testing.T) {
	err := ValidateConnectorSettings(
		"kaiten.integration.crm.attio",
		map[string]any{},
		map[string]any{"apiKey": "secret"},
		"UpdateConnectorSettings.InvalidPayloadSchema",
	)

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
}
