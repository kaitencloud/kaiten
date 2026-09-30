package attio

import (
	"slices"
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

func TestManifestNamesTheConnectorTheWayEveryStoredRowDoes(t *testing.T) {
	// Three things already hold this string: the customer and instance integration
	// rows, the Vault path the settings live at, and the console's URLs. Asserted
	// literally rather than against the const, which would assert nothing.
	if Name != "kaiten.integration.crm.attio" {
		t.Fatalf("connector name changed to %q: existing integration rows and Vault paths hold the old one", Name)
	}
	if Manifest().Name != Name {
		t.Fatalf("the manifest registers %q but the connector answers to %q", Manifest().Name, Name)
	}

	// The registration use case normalizes and validates the name, so a manifest
	// this rejects would fail startup rather than register.
	normalized, err := common.ValidateConnectorName(Manifest().Name, "Test.InvalidName")
	if err != nil {
		t.Fatalf("the manifest's name must be one registration accepts: %v", err)
	}
	if normalized != Name {
		t.Fatalf("registration would store %q, not %q", normalized, Name)
	}
}

func TestManifestGatesActivationOnTheConnectorsOwnEntitlement(t *testing.T) {
	slug := Manifest().EntitlementSlug
	if slug == nil {
		t.Fatal("Attio is an enterprise connector: its manifest must name the entitlement a license has to grant")
	}
	if *slug != dogfooding.ConnectorAttioEntitlementSlug {
		t.Fatalf("the manifest gates on %q, but the entitlement catalogue declares %q",
			*slug, dogfooding.ConnectorAttioEntitlementSlug)
	}
}

func TestManifestShipsASchemaRegistrationAccepts(t *testing.T) {
	if err := common.ValidateSettingsSchema(Manifest().SettingsSchema, "Test.InvalidSchema"); err != nil {
		t.Fatalf("the manifest's settings schema must be one registration accepts: %v", err)
	}
}

func TestManifestMarksTheAPIKeyAsASecret(t *testing.T) {
	// writeOnly is what makes getsettings redact the key on the way out. Without it
	// the console would show every organization's Attio credential to anyone who can
	// read its connector settings.
	secrets := common.SecretFields(Manifest().SettingsSchema)
	if !slices.Contains(secrets, "attioApiKey") {
		t.Fatalf("expected attioApiKey to be a secret field, got %v", secrets)
	}
}

func TestManifestAndTheResolverAgreeOnTheStoredShape(t *testing.T) {
	// The one test that would catch the two drifting apart: updatesettings validates
	// what an operator saves against this schema, and resolveSettings reads exactly
	// one spelling of each key back out. A schema that accepted a different spelling
	// would store settings the connector then reports as "not configured".
	stored := map[string]any{
		"attioApiKey": "attio-key",
		"attioApiUrl": "https://api.attio.com",
		"syncPolicy":  string(SyncPolicyFailAndRetry),
		"fieldsMapping": map[string]any{
			"instance.licenseType": "kaiten_license_type",
		},
	}

	if err := common.ValidateConnectorSettings(Name, Manifest().SettingsSchema, stored, "Test.InvalidSettings"); err != nil {
		t.Fatalf("the schema must accept the payload the resolver reads: %v", err)
	}

	settings, err := resolveSettings(stored)
	if err != nil {
		t.Fatalf("the resolver must read the payload the schema accepts: %v", err)
	}
	if settings.APIKey != "attio-key" {
		t.Fatalf("the resolver read %+v out of the validated payload", settings)
	}
	if settings.SyncPolicy != SyncPolicyFailAndRetry {
		t.Fatalf("expected the stored sync policy to survive validation, got %q", settings.SyncPolicy)
	}
	if settings.FieldsMapping["instance.licenseType"] != "kaiten_license_type" {
		t.Fatalf("expected the stored mapping to survive validation, got %#v", settings.FieldsMapping)
	}
}

func TestManifestRefusesSettingsTheResolverWouldIgnore(t *testing.T) {
	// additionalProperties:false is why the resolver needs no tolerance for other
	// spellings: a key it does not read cannot be stored in the first place, so an
	// operator gets a validation error rather than settings that silently do nothing.
	stored := map[string]any{
		"attioApiKey":   "attio-key",
		"attioApiUrl":   "https://api.attio.com",
		"syncPolicy":    string(SyncPolicyCreateAndBind),
		"fieldsMapping": map[string]any{},
		"attio_api_key": "attio-key",
	}

	if err := common.ValidateConnectorSettings(Name, Manifest().SettingsSchema, stored, "Test.InvalidSettings"); err == nil {
		t.Fatal("expected the schema to refuse a key the resolver never reads")
	}
}

func TestManifestRefusesAnyAPIURLButAttios(t *testing.T) {
	// The schema is what stops an organization storing a URL that would make the API
	// call another host with its Attio key, and hand the answer back in last_error.
	for _, url := range []string{
		"https://api.attio.example",
		"http://169.254.169.254/latest/meta-data",
		"http://localhost:3000",
		"https://api.attio.com/",
		"https://api.attio.com.attacker.example",
	} {
		stored := map[string]any{
			"attioApiKey":   "attio-key",
			"attioApiUrl":   url,
			"syncPolicy":    string(SyncPolicyCreateAndBind),
			"fieldsMapping": map[string]any{},
		}

		if err := common.ValidateConnectorSettings(Name, Manifest().SettingsSchema, stored, "Test.InvalidSettings"); err == nil {
			t.Errorf("expected the schema to refuse attioApiUrl %q", url)
		}
	}
}
