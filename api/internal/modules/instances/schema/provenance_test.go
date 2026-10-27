package schema

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// §7.5: the view writes provenance in snake_case; the API answers it in
// camelCase. A CONFIG value is the vendor's own object and keeps its keys.
func TestProvenanceIsCamelCaseButValuesAreTheVendors(t *testing.T) {
	raw := []byte(`{
	  "license": {"license_entitlement_id": "7c8d0f6e-3b52-4f7a-9d1c-2a6b8e4f1c01", "value": {"type": "number", "value": 10000},
	              "limit_cap_exceeded_overage_percent": 50},
	  "addons": [{"instance_addon_id": "7c8d0f6e-3b52-4f7a-9d1c-2a6b8e4f1c02", "addon_id": "7c8d0f6e-3b52-4f7a-9d1c-2a6b8e4f1c03",
	              "addon_entitlement_id": "7c8d0f6e-3b52-4f7a-9d1c-2a6b8e4f1c04", "quantity": 3, "override_behavior": "ADD",
	              "value": {"type": "object", "value": {"max_items": 3}}, "limit_cap_exceeded_overage_percent": null,
	              "attached_at": "2027-02-05T09:00:00.123"}],
	  "boosts": [{"instance_voucher_id": "7c8d0f6e-3b52-4f7a-9d1c-2a6b8e4f1c05", "voucher_id": "7c8d0f6e-3b52-4f7a-9d1c-2a6b8e4f1c06",
	              "voucher_entitlement_grant_id": "7c8d0f6e-3b52-4f7a-9d1c-2a6b8e4f1c07", "modifier_type": "MULTIPLY",
	              "modifier_value": 2, "redeemed_at": "2027-02-06T10:00:00", "effective_starts_at": "2027-02-06T10:00:00",
	              "effective_expires_at": null}],
	  "number": {"license": 10000, "after_addons": 13000, "boost_set": null, "boost_add": null, "boost_multiply": 2,
	             "unlimited": false, "effective": 26000}
	}`)
	provenance, err := ParseProvenance(raw)
	require.NoError(t, err)

	require.EqualValues(t, 50, *provenance.License.LimitCapExceededOveragePercent)
	require.InDelta(t, 10000, provenance.License.Value.Number.Value, 0)
	require.Len(t, provenance.Addons, 1)
	require.Equal(t, time.Date(2027, 2, 5, 9, 0, 0, 123_000_000, time.UTC), provenance.Addons[0].AttachedAt)
	require.Nil(t, provenance.Boosts[0].EffectiveExpiresAt)
	require.InDelta(t, 26000, provenance.Number.Effective, 0)

	out, err := json.Marshal(provenance)
	require.NoError(t, err)
	body := string(out)
	for _, member := range []string{
		`"licenseEntitlementId"`, `"limitCapExceededOveragePercent"`, `"instanceAddonId"`, `"overrideBehavior"`,
		`"attachedAt":"2027-02-05T09:00:00.123Z"`, `"voucherEntitlementGrantId"`, `"effectiveExpiresAt":null`, `"afterAddons":13000`, `"boostMultiply":2`,
	} {
		require.Contains(t, body, member)
	}
	require.Contains(t, body, `"max_items":3`, "the vendor's object keeps its keys")
	require.NotContains(t, body, "license_entitlement_id")

	none, err := ParseProvenance(nil)
	require.NoError(t, err)
	require.Nil(t, none)
}
