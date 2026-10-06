package licenseprices_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// What a price meters stays in place under it.
func TestMeteredEntitlementReferences(t *testing.T) {
	t.Run("AGrantAnActivePriceMeters_CannotBeRemoved_UntilThePriceIsDeprecated", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		newEntitlement(t, "tokens", "MONTH", 0)
		grant(t, slug, "tokens", 1000, 50)
		price := createPrice(t, slug, metered("OVERAGE", "tokens", "1"))
		path := "/api/licenses/" + slug + "/entitlements/tokens"

		require.Equal(t, "DeleteLicenseEntitlement.MeteredByPrice", problemCode(t, fiber.StatusConflict, "DELETE", path, nil))

		resp := call(t, "POST", "/api/licenses/"+slug+"/prices/"+price.ID.String()+"/deprecate", nil)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		resp = call(t, "DELETE", path, nil)
		require.Less(t, resp.StatusCode, 300)
	})

	t.Run("AnUnmeteredGrant_IsRemovedAsBefore", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		newEntitlement(t, "tokens", "MONTH", 0)
		grant(t, slug, "tokens", 1000, 50)
		resp := call(t, "DELETE", "/api/licenses/"+slug+"/entitlements/tokens", nil)
		require.Less(t, resp.StatusCode, 300)
	})

	t.Run("AnEntitlementAPriceMeters_CannotBeDeleted_EvenOnceDeprecated", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		slug := newVersion(t, "Pro", schema.Draft)
		newEntitlement(t, "tokens", "MONTH", 0)
		grant(t, slug, "tokens", 1000, 50)
		price := createPrice(t, slug, metered("USAGE_BASED", "tokens", "1"))

		require.Equal(t, "DeleteEntitlement.InUseConflict", problemCode(t, fiber.StatusConflict, "DELETE", "/api/entitlements/tokens", nil))

		resp := call(t, "POST", "/api/licenses/"+slug+"/prices/"+price.ID.String()+"/deprecate", nil)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.Equal(t, "DeleteEntitlement.InUseConflict", problemCode(t, fiber.StatusConflict, "DELETE", "/api/entitlements/tokens", nil))
	})
}
