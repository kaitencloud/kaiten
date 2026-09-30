package attio

import (
	"errors"
	"testing"
)

func TestResolveSettingsRefusesAPayloadItCannotSyncWith(t *testing.T) {
	cases := map[string]map[string]any{
		"no api key":           {"attioApiUrl": "https://api.attio.com"},
		"blank api key":        {"attioApiKey": "   ", "attioApiUrl": "https://api.attio.com"},
		"api key not a string": {"attioApiKey": 42, "attioApiUrl": "https://api.attio.com"},
		"no api url":           {"attioApiKey": "attio-key"},
		"blank api url":        {"attioApiKey": "attio-key", "attioApiUrl": " "},
		"empty payload":        {},
	}

	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			// ErrNotConfigured specifically, because the consumer reads it as a
			// terminal skip: no redelivery invents an API key, and retrying would
			// turn one misconfigured organization into an endless loop.
			if _, err := resolveSettings(payload); !errors.Is(err, ErrNotConfigured) {
				t.Fatalf("expected ErrNotConfigured, got: %v", err)
			}
		})
	}
}

func TestResolveSettingsTrimsWhatTheConsoleMayHavePasted(t *testing.T) {
	settings, err := resolveSettings(map[string]any{
		"attioApiKey": "  attio-key  ",
		"attioApiUrl": "  https://api.attio.com  ",
	})
	if err != nil {
		t.Fatalf("expected the settings to resolve, got: %v", err)
	}

	if settings.APIKey != "attio-key" {
		t.Errorf("expected the api key to be trimmed, got %q", settings.APIKey)
	}
}

func TestResolveSettingsAcceptsAttiosAPIWithATrailingSlash(t *testing.T) {
	// The schema only admits the URL without one, but settings stored before it did
	// may carry one, and it names the same API.
	if _, err := resolveSettings(map[string]any{
		"attioApiKey": "attio-key",
		"attioApiUrl": "https://api.attio.com/",
	}); err != nil {
		t.Fatalf("expected the settings to resolve, got: %v", err)
	}
}

func TestResolveSettingsRefusesAnyAPIURLButAttios(t *testing.T) {
	// Settings stored before the schema pinned the URL must not reach any other host:
	// each of these would have sent the organization's requests, and its API key,
	// somewhere other than Attio.
	urls := map[string]string{
		"cloud metadata":          "http://169.254.169.254/latest/meta-data",
		"loopback":                "http://localhost:3000",
		"cluster service":         "http://kaiten-api.kaiten.svc:3000",
		"lookalike host":          "https://api.attio.com.attacker.example",
		"credentials before host": "https://api.attio.com@attacker.example",
		"plain http":              "http://api.attio.com",
		"a path under the api":    "https://api.attio.com/v2",
		"another scheme":          "ftp://api.attio.com",
	}

	for name, url := range urls {
		t.Run(name, func(t *testing.T) {
			_, err := resolveSettings(map[string]any{"attioApiKey": "attio-key", "attioApiUrl": url})
			if !errors.Is(err, ErrNotConfigured) {
				t.Fatalf("expected %q to be refused as ErrNotConfigured, got: %v", url, err)
			}
		})
	}
}

func TestResolveSettingsDefaultsTheSyncPolicy(t *testing.T) {
	// Defaulting rather than refusing: the two policies differ only on a path most
	// organizations never hit, so a typo in one optional field must not stop a
	// connector that would otherwise work.
	cases := map[string]SyncPolicy{
		"":                 SyncPolicyCreateAndBind,
		"create-and-bind":  SyncPolicyCreateAndBind,
		"nonsense":         SyncPolicyCreateAndBind,
		"fail-and-retry":   SyncPolicyFailAndRetry,
		"  Fail-And-Retry": SyncPolicyFailAndRetry,
	}

	for value, expected := range cases {
		settings, err := resolveSettings(map[string]any{
			"attioApiKey": "attio-key",
			"attioApiUrl": "https://api.attio.com",
			"syncPolicy":  value,
		})
		if err != nil {
			t.Fatalf("expected the settings to resolve for %q, got: %v", value, err)
		}
		if settings.SyncPolicy != expected {
			t.Errorf("syncPolicy %q resolved to %q, expected %q", value, settings.SyncPolicy, expected)
		}
	}
}

func TestResolveSettingsReadsTheFieldsMappingTolerantly(t *testing.T) {
	settings, err := resolveSettings(map[string]any{
		"attioApiKey": "attio-key",
		"attioApiUrl": "https://api.attio.com",
		"fieldsMapping": map[string]any{
			"instance.licenseType": "kaiten_license_type",
			"instance.brokenValue": 7,
		},
	})
	if err != nil {
		t.Fatalf("expected the settings to resolve, got: %v", err)
	}

	// A mapping the settings schema already validated cannot be malformed, so
	// skipping a non-string entry costs nothing for a payload that is -- and
	// refusing the whole sync over one bad entry would cost the rest of the fields.
	if got := settings.FieldsMapping["instance.licenseType"]; got != "kaiten_license_type" {
		t.Errorf("expected the mapped attribute, got %q", got)
	}
	if _, ok := settings.FieldsMapping["instance.brokenValue"]; ok {
		t.Error("expected a non-string mapping entry to be skipped")
	}
}

func TestResolveSettingsTreatsAMissingMappingAsAnEmptyOne(t *testing.T) {
	// An empty mapping is legitimate and means "sync the built-in fields only", so
	// the consumer gets a usable map rather than a nil it has to guard.
	for name, payload := range map[string]map[string]any{
		"absent":        {"attioApiKey": "k", "attioApiUrl": "https://api.attio.com"},
		"not an object": {"attioApiKey": "k", "attioApiUrl": "https://api.attio.com", "fieldsMapping": "nope"},
	} {
		t.Run(name, func(t *testing.T) {
			settings, err := resolveSettings(payload)
			if err != nil {
				t.Fatalf("expected the settings to resolve, got: %v", err)
			}
			if settings.FieldsMapping == nil {
				t.Fatal("expected an empty mapping rather than nil")
			}
			if len(settings.FieldsMapping) != 0 {
				t.Fatalf("expected an empty mapping, got %#v", settings.FieldsMapping)
			}
		})
	}
}
