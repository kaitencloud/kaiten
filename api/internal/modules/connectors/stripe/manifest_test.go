package stripe

import (
	"slices"
	"sort"
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/common"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

func TestManifestNamesTheConnectorUnderItsReverseDNSName(t *testing.T) {
	// The Vault path, the console route and every stored activation hold this
	// string: asserted literally.
	if Name != "kaiten.integration.billing.stripe" {
		t.Fatalf("connector name changed to %q", Name)
	}
	normalized, err := common.ValidateConnectorName(Manifest().Name, "Test.InvalidName")
	if err != nil || normalized != Name {
		t.Fatalf("registration must accept the name unchanged: %q, %v", normalized, err)
	}
	if _, err := common.ValidateConnectorName("stripe", "Test.InvalidName"); err == nil {
		t.Fatal("the bare name stripe is refused by registration, which is why the connector is not called that")
	}
}

func TestManifestGatesOnConnectorStripe(t *testing.T) {
	slug := Manifest().EntitlementSlug
	if slug == nil || *slug != dogfooding.ConnectorStripeEntitlementSlug {
		t.Fatalf("the manifest gates on %v, want %q", slug, dogfooding.ConnectorStripeEntitlementSlug)
	}
	if !slices.Contains(dogfooding.BooleanEntitlementSlugs, *slug) {
		t.Fatal("connector-stripe is a BOOLEAN entitlement")
	}
}

func TestManifestSchema(t *testing.T) {
	schema := Manifest().SettingsSchema
	if err := common.ValidateSettingsSchema(schema, "Test.InvalidSchema"); err != nil {
		t.Fatalf("registration accepts the schema: %v", err)
	}
	properties := schema["properties"].(map[string]any)
	var keys []string
	for key := range properties {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	if !slices.Equal(keys, []string{"autoFinalize", "automaticTax", "stripeSecretKey", "taxBehavior"}) {
		t.Fatalf("exactly four settings, got %v", keys)
	}
	if secrets := common.SecretFields(schema); !slices.Equal(secrets, []string{SettingSecretKey}) {
		t.Fatalf("the key is the one secret, got %v", secrets)
	}
}

func TestManifestSchemaRefusesWhatIsNotARestrictedKey(t *testing.T) {
	schema := Manifest().SettingsSchema
	for _, key := range []string{"sk_test_abc", "pk_live_abc", "rk_prod_abc", "rk_test_ab-c"} {
		err := common.ValidateConnectorSettings(Name, schema, map[string]any{SettingSecretKey: key}, "Test.Invalid")
		if err == nil {
			t.Errorf("%s is not a restricted key and must be refused", key)
		}
	}
	for name, settings := range map[string]map[string]any{
		"lower-case tax behaviour": {SettingSecretKey: "rk_test_A1", SettingTaxBehavior: "exclusive"},
		"string boolean":           {SettingSecretKey: "rk_test_A1", SettingAutomaticTax: "yes"},
		"unknown member":           {SettingSecretKey: "rk_test_A1", "webhookSecret": "whsec_1"},
		"no key":                   {SettingAutoFinalize: true},
	} {
		if err := common.ValidateConnectorSettings(Name, schema, settings, "Test.Invalid"); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
	if err := common.ValidateConnectorSettings(Name, schema, map[string]any{
		SettingSecretKey: "rk_live_A1", SettingAutomaticTax: true, SettingTaxBehavior: "INCLUSIVE", SettingAutoFinalize: false,
	}, "Test.Invalid"); err != nil {
		t.Fatalf("a complete configuration is accepted: %v", err)
	}
}
