package entitlements_test

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func groupUsageBySlug(t *testing.T, groupSlug, instanceSlug string) map[string]*schema.EntitlementGroupUsage {
	t.Helper()
	resp, err := testServer.App.Test(httptest.NewRequest("GET", "/api/entitlement-groups/"+groupSlug+"/usage?instance="+instanceSlug, nil), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	items := commonfixture.AssertJSONResponse[[]*schema.EntitlementGroupUsage](t, resp, fiber.StatusOK)
	bySlug := make(map[string]*schema.EntitlementGroupUsage, len(items))
	for _, item := range items {
		bySlug[item.EntitlementSlug] = item
	}
	return bySlug
}

// A group lists its members one by one, with no total of its own: a combined
// member is one of them, and reads as the sum of the sources the instance is granted.
func TestGetEntitlementGroupUsage_ACombinedMemberIsComputed(t *testing.T) {
	t.Run("LifetimeSources", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newGroupUsageInstance(t)
		first, second := newSource(t, "firecrawl-credits"), newSource(t, "scraped-pages")
		newCombined(t, "credits", src("firecrawl-credits", "0.4"), src("scraped-pages", "0.6"))
		group := createEntitlementGroup(t, "Quotas", "quotas-"+instance.Slug)
		for _, slug := range []string{"credits", "firecrawl-credits", "scraped-pages"} {
			addEntitlementToGroup(t, group.Slug, slug)
		}
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, "firecrawl-credits", 1000)
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, "scraped-pages", 1000)
		seedGroupUsageRow(t, instance.ID, first.ID, 300, 3, nil)
		seedGroupUsageRow(t, instance.ID, second.ID, 100, 2, nil)

		members := groupUsageBySlug(t, group.Slug, instance.Slug)

		require.Len(t, members, 3)
		credits := members["credits"]
		require.NotNil(t, credits.UsageValue)
		require.NotNil(t, credits.UsageValue.Number)
		assert.InDelta(t, 180, credits.UsageValue.Number.Value, 1e-9)
		assert.EqualValues(t, 5, credits.UsageValue.Number.EventCount)
		require.NotNil(t, credits.LicenseValue)
		assert.InDelta(t, 1000, credits.LicenseValue.Number.Value, 1e-9)
		assert.Equal(t, "NUMBER", credits.EntitlementType)
		assert.Nil(t, credits.CurrentPeriodStart)
		assert.InDelta(t, 300, members["firecrawl-credits"].UsageValue.Number.Value, 0, "the sources are listed as before")
	})

	t.Run("PeriodicSourcesShareTheirWindow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newGroupUsageInstance(t)
		first, second := newSource(t, "calls", monthly(period.Calendar)), newSource(t, "pages", monthly(period.Calendar))
		newCombined(t, "credits", src("calls", "1"), src("pages", "2"))
		group := createEntitlementGroup(t, "Quotas", "quotas-"+instance.Slug)
		for _, slug := range []string{"credits", "calls", "pages"} {
			addEntitlementToGroup(t, group.Slug, slug)
		}
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, "calls", 100)
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, "pages", 100)
		window, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		seedGroupUsageRow(t, instance.ID, first.ID, 10, 1, &window.Start)
		stale := window.Start.AddDate(0, -1, 0)
		seedGroupUsageRow(t, instance.ID, second.ID, 5, 1, &stale)

		credits := groupUsageBySlug(t, group.Slug, instance.Slug)["credits"]

		assert.InDelta(t, 10, credits.UsageValue.Number.Value, 1e-9, "the stale window of one source counts for nothing, as it reads for itself")
		assert.InDelta(t, 300, credits.LicenseValue.Number.Value, 1e-9)
		require.NotNil(t, credits.CurrentPeriodStart)
		assert.True(t, credits.CurrentPeriodStart.Equal(window.Start))
		assert.True(t, credits.CurrentPeriodEnd.Equal(window.End))
	})

	// The combined entitlement's own window is stored, and its row has nothing to
	// join: with no source granted it must not read as a zero in a window.
	t.Run("NoGrantedSourceHasNoUsage", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newGroupUsageInstance(t)
		newSource(t, "calls", monthly(period.Calendar))
		newSource(t, "pages", monthly(period.Calendar))
		newCombined(t, "credits", src("calls", "1"), src("pages", "2"))
		seats := newSource(t, "seats")
		group := createEntitlementGroup(t, "Quotas", "quotas-"+instance.Slug)
		for _, slug := range []string{"credits", "seats"} {
			addEntitlementToGroup(t, group.Slug, slug)
		}
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, seats.Slug, 10)

		credits := groupUsageBySlug(t, group.Slug, instance.Slug)["credits"]

		require.NotNil(t, credits, "it is a member of the group")
		assert.Nil(t, credits.UsageValue)
		assert.Nil(t, credits.LicenseValue)
		assert.Nil(t, credits.CurrentPeriodStart)
		assert.Nil(t, credits.CurrentPeriodEnd)
	})
}
