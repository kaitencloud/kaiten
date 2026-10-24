package common

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"

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
			fmt.Sprintf("Connector settings payload does not match schema for connector %q: %s", connectorName,
				describe(err, SecretFields(settingsSchema))),
		)
	}

	return nil
}

// describe is a validation failure as the caller may read it. The validator
// quotes the value it refused (a pattern, an enum), so a failure that
// touches a writeOnly field names the field and the rule only: a secret
// pasted in the wrong shape -- an sk_live_ key where an rk_ one is expected
// -- is never sent back or logged (§20.1 rule 5).
func describe(err error, secrets []string) string {
	var failure *jsonschema.ValidationError
	if !errors.As(err, &failure) || !touches(failure, secrets) {
		return err.Error()
	}
	printer := message.NewPrinter(language.English)
	var parts []string
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) > 0 {
			for _, cause := range e.Causes {
				walk(cause)
			}
			return
		}
		at := "/" + strings.Join(e.InstanceLocation, "/")
		if len(e.InstanceLocation) > 0 && slices.Contains(secrets, e.InstanceLocation[0]) {
			parts = append(parts, fmt.Sprintf("at '%s': the value breaks the schema's %q rule (a secret: it is not repeated)",
				at, strings.Join(e.ErrorKind.KeywordPath(), "/")))
			return
		}
		parts = append(parts, fmt.Sprintf("at '%s': %s", at, e.ErrorKind.LocalizedString(printer)))
	}
	walk(failure)
	return strings.Join(parts, "; ")
}

func touches(e *jsonschema.ValidationError, secrets []string) bool {
	if len(e.InstanceLocation) > 0 && slices.Contains(secrets, e.InstanceLocation[0]) {
		return true
	}
	for _, cause := range e.Causes {
		if touches(cause, secrets) {
			return true
		}
	}
	return false
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
