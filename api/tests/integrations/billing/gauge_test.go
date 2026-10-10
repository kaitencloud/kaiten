package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// §7.4, §13.7: the gauge reads say where a quota comes from -- the licence or
// only add-ons -- and what each layer contributes.
func TestGaugeReadsSayWhereAQuotaComesFrom(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	newEntitlement(t, "calls", 0)
	s := newSold(t, flatFee("2900", "MONTHLY"))
	grant(t, s.version.Slug, "seats", 10, 50)
	addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})
	addonGrant(t, addon.Slug, "seats", 5, "ADD")
	addonGrant(t, addon.Slug, "calls", 100, "ADD")
	fits(t, addon.Slug, s.version.Slug)
	attached := attach(t, s.instance.Slug, addon.Slug, 2)

	listed := commonfixture.AssertJSONResponse[[]instanceschema.EntitlementUsage](t,
		call(t, "GET", "/api/instances/"+s.instance.Slug+"/entitlements/usage", nil), fiber.StatusOK)
	bySlug := map[string]instanceschema.EntitlementUsage{}
	for _, usage := range listed {
		bySlug[usage.EntitlementSlug] = usage
	}

	seats := bySlug["seats"]
	require.Equal(t, instanceschema.SourceLicense, seats.Source)
	require.InDelta(t, 20, seats.Limit.Number.Value, 0, "10 + 2 × 5")
	require.EqualValues(t, 50, *seats.LimitCapExceededOveragePercent, "the licence's, which the add-on does not set")
	require.NotNil(t, seats.Provenance.License)
	require.InDelta(t, 10, seats.Provenance.License.Value.Number.Value, 0)
	require.Len(t, seats.Provenance.Addons, 1)
	require.Equal(t, attached.ID, seats.Provenance.Addons[0].InstanceAddonID)
	require.EqualValues(t, 2, seats.Provenance.Addons[0].Quantity)
	require.Equal(t, "ADD", seats.Provenance.Addons[0].OverrideBehavior)
	require.Empty(t, seats.Provenance.Boosts)
	require.InDelta(t, 20, seats.Provenance.Number.Effective, 0)
	require.InDelta(t, 10, *seats.Provenance.Number.License, 0)

	calls := bySlug["calls"]
	require.Equal(t, instanceschema.SourceAddon, calls.Source)
	require.Nil(t, calls.Provenance.License, "only the add-on grants it")
	require.EqualValues(t, 0, *calls.LimitCapExceededOveragePercent, "an add-on-only quota is a hard limit")

	one := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t,
		call(t, "GET", "/api/instances/"+s.instance.Slug+"/entitlements/seats/usage", nil), fiber.StatusOK)
	require.Equal(t, seats.Source, one.Source)
	require.Equal(t, seats.Provenance, one.Provenance)
	require.Equal(t, seats.LimitCapExceededOveragePercent, one.LimitCapExceededOveragePercent)
}
