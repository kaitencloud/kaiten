package common

import (
	"bytes"
	"encoding/json"
	"fmt"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func ValidateSettingsSchema(settingsSchema map[string]any, code string) error {
	if _, err := compileSettingsSchema(settingsSchema); err != nil {
		return kaitenerrors.Validation(
			code,
			fmt.Sprintf("Connector settings schema is invalid: %s", err.Error()),
		)
	}

	return nil
}

func ValidateConnectorSettings(connectorName string, settingsSchema, settings map[string]any, code string) error {
	compiledSchema, err := compileSettingsSchema(settingsSchema)
	if err != nil {
		return kaitenerrors.Validation(
			code,
			fmt.Sprintf("Connector settings schema for connector %q is invalid: %s", connectorName, err.Error()),
		)
	}

	if err := compiledSchema.Validate(settings); err != nil {
		return kaitenerrors.Validation(
			code,
			fmt.Sprintf("Connector settings payload does not match schema for connector %q: %s", connectorName, err.Error()),
		)
	}

	return nil
}

func compileSettingsSchema(settingsSchema map[string]any) (*jsonschema.Schema, error) {
	if len(settingsSchema) == 0 {
		return nil, fmt.Errorf("settings schema cannot be empty")
	}

	schemaBytes, err := json.Marshal(settingsSchema)
	if err != nil {
		return nil, fmt.Errorf("encode settings schema: %w", err)
	}

	const schemaID = "connector.settings.schema.json"

	// v6's AddResource takes an already-decoded JSON value, not a reader --
	// UnmarshalJSON decodes via json.Number instead of float64, avoiding any
	// precision loss in numeric schema keywords.
	schemaDoc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaBytes))
	if err != nil {
		return nil, fmt.Errorf("decode settings schema: %w", err)
	}

	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource(schemaID, schemaDoc); err != nil {
		return nil, fmt.Errorf("load settings schema: %w", err)
	}

	compiledSchema, err := compiler.Compile(schemaID)
	if err != nil {
		return nil, fmt.Errorf("compile settings schema: %w", err)
	}

	return compiledSchema, nil
}
