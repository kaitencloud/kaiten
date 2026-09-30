package dbmap_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
)

// Pins the wire shape of usageValue/licenseValue: the typed object the contract
// promises, not the base64 string Go marshals a []byte into.
func TestEntitlementGroupUsage_MarshalsValuesAsObjects(t *testing.T) {
	item, err := dbmap.ToEntitlementGroupUsage(&db.GetEntitlementGroupUsageRow{
		EntitlementID:   uuid.MustParse("123e4567-e89b-12d3-a456-426614174000"),
		EntitlementSlug: "ai-credits",
		EntitlementName: "AI Credits",
		EntitlementType: db.EntitlementTypeNUMBER,
		UsageValue:      []byte(`{"type":"number","value":7,"event_count":3}`),
		LicenseValue:    []byte(`{"type":"number","value":10}`),
	})
	require.NoError(t, err)

	encoded, err := json.Marshal(item)
	require.NoError(t, err)

	var decoded struct {
		UsageValue   map[string]any `json:"usageValue"`
		LicenseValue map[string]any `json:"licenseValue"`
	}
	require.NoError(t, json.Unmarshal(encoded, &decoded),
		"usageValue/licenseValue must decode as objects, not as a base64 string")

	require.Equal(t, "number", decoded.UsageValue["type"])
	require.EqualValues(t, 7, decoded.UsageValue["value"])
	require.EqualValues(t, 3, decoded.UsageValue["event_count"])

	require.Equal(t, "number", decoded.LicenseValue["type"])
	require.EqualValues(t, 10, decoded.LicenseValue["value"])
}

// TestEntitlementGroupUsage_OmitsAbsentValues covers the LEFT JOINs behind
// the query: an entitlement with no usage row and no license grant.
func TestEntitlementGroupUsage_OmitsAbsentValues(t *testing.T) {
	item, err := dbmap.ToEntitlementGroupUsage(&db.GetEntitlementGroupUsageRow{
		EntitlementID:   uuid.MustParse("123e4567-e89b-12d3-a456-426614174000"),
		EntitlementSlug: "ai-credits",
		EntitlementName: "AI Credits",
		EntitlementType: db.EntitlementTypeNUMBER,
	})
	require.NoError(t, err)
	require.Nil(t, item.UsageValue)
	require.Nil(t, item.LicenseValue)

	encoded, err := json.Marshal(item)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "usageValue")
	require.NotContains(t, string(encoded), "licenseValue")
}
