package common

import "sort"

// RedactedSecretValue replaces write-only settings values in API responses.
// Clients may echo it back (or omit the field entirely) to keep the stored
// value unchanged on update.
const RedactedSecretValue = "***"

// SecretFields lists the top-level properties flagged `writeOnly: true` in a
// connector settings JSON schema. Connector manifests use this standard
// annotation to mark credentials that must never be returned to clients.
func SecretFields(settingsSchema map[string]any) []string {
	properties, ok := settingsSchema["properties"].(map[string]any)
	if !ok {
		return nil
	}

	fields := make([]string, 0, len(properties))
	for name, raw := range properties {
		property, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if writeOnly, ok := property["writeOnly"].(bool); ok && writeOnly {
			fields = append(fields, name)
		}
	}

	sort.Strings(fields)

	return fields
}

// RedactSecrets returns a copy of settings where every non-empty secret field
// is replaced by RedactedSecretValue. Absent or empty fields are left as-is so
// clients can still distinguish "configured" from "not configured".
func RedactSecrets(settings map[string]any, secretFields []string) map[string]any {
	if settings == nil {
		return nil
	}

	redacted := make(map[string]any, len(settings))
	for key, value := range settings {
		redacted[key] = value
	}

	for _, field := range secretFields {
		if value, ok := redacted[field]; ok && value != nil && value != "" {
			redacted[field] = RedactedSecretValue
		}
	}

	return redacted
}

// MergeStoredSecrets restores stored secret values when the incoming payload
// omits a secret field, or sends it empty or redacted. This lets clients
// update non-secret settings without ever echoing plaintext secrets back.
func MergeStoredSecrets(incoming, stored map[string]any, secretFields []string) map[string]any {
	if len(secretFields) == 0 || len(stored) == 0 {
		return incoming
	}

	merged := make(map[string]any, len(incoming)+len(secretFields))
	for key, value := range incoming {
		merged[key] = value
	}

	for _, field := range secretFields {
		storedValue, hasStored := stored[field]
		if !hasStored {
			continue
		}

		incomingValue, hasIncoming := merged[field]
		if !hasIncoming || incomingValue == nil || incomingValue == "" || incomingValue == RedactedSecretValue {
			merged[field] = storedValue
		}
	}

	return merged
}

// HasSettings reports whether a connector declares settings at all. One that
// does stores them in Vault, so it cannot work on a deployment without one.
func HasSettings(settingsSchema map[string]any) bool {
	properties, ok := settingsSchema["properties"].(map[string]any)
	return ok && len(properties) > 0
}
