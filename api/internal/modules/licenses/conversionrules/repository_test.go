package conversionrules

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func text(v string) *string { return &v }
func TestPricingValidation(t *testing.T) {
	for _, v := range []string{"0", "0.0000000001", "99999999.9999999999"} {
		_, err := Prepare(Pricing{Rates: schema.ConversionRates{PerRequest: text(v)}}, "CreateConversionRule")
		require.NoError(t, err)
	}
	for _, v := range []string{"-1", "1e2", "NaN", "Infinity", "100000000", "0.00000000001", "", ".1", "1."} {
		_, err := Prepare(Pricing{Rates: schema.ConversionRates{PerRequest: text(v)}}, "CreateConversionRule")
		require.Error(t, err)
		require.Equal(t, 422, apierrors.GetHTTPStatus(err))
	}
	for _, p := range []Pricing{{}, {Rates: schema.ConversionRates{PerUnit: text("1")}, MinimumCreditsPerRequest: "2", MaximumCreditsPerRequest: text("1")}, {Rates: schema.ConversionRates{PerSecond: text("1")}, MinimumCreditsPerRequest: "1000000000000"}, {Rates: schema.ConversionRates{PerRequest: text("1")}, MaximumCreditsPerRequest: text("0.0000001")}, {Rates: schema.ConversionRates{PerRequest: text("1")}, ChargeOnError: "INVALID"}} {
		_, err := Prepare(p, "UpdateConversionRule")
		require.Error(t, err)
	}
	for _, policy := range []aicredit.ChargeOnError{aicredit.Never, aicredit.Always, aicredit.ProviderErrorOnly} {
		_, err := Prepare(Pricing{Rates: schema.ConversionRates{PerRequest: text("0")}, MinimumCreditsPerRequest: "999999999999.999999", ChargeOnError: policy}, "CreateConversionRule")
		require.NoError(t, err)
	}
}

func TestImmutablePresence(t *testing.T) {
	typ := aicredit.Completion
	before := &schema.ConversionRule{EntitlementSlug: "credits", ModelSlug: text("model"), RequestType: &typ}
	for _, body := range []string{`{}`, `{"entitlementSlug":"credits","modelSlug":"model","requestType":"COMPLETION"}`} {
		var c UpdateConversionRuleBody
		require.NoError(t, json.Unmarshal([]byte(body), &c))
		require.NoError(t, CheckIdentity(&c, before))
	}
	for _, body := range []string{`{"entitlementSlug":null}`, `{"modelSlug":null}`, `{"requestType":null}`, `{"modelSlug":"other"}`} {
		var c UpdateConversionRuleBody
		require.NoError(t, json.Unmarshal([]byte(body), &c))
		require.Error(t, CheckIdentity(&c, before))
	}
}

func TestCreateWildcardSchemaIncludesNull(t *testing.T) {
	registry := huma.NewMapRegistry("#/components/schemas/", huma.DefaultSchemaNamer)
	body := huma.SchemaFromType(registry, reflect.TypeFor[CreateConversionRuleBody]())
	require.True(t, body.Properties["requestType"].Nullable)
	require.Contains(t, body.Properties["requestType"].Enum, any(nil))
}
