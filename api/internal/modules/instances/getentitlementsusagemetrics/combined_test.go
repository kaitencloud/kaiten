package getentitlementsusagemetrics

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

var (
	licenseID   = uuid.New()
	combinedID  = uuid.New()
	periodStart = time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	periodEnd   = time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
)

// granted is the usage of one NUMBER entitlement an instance is granted, as
// MapUsageRows maps it.
func granted(slug string, used, limit float64, events int32, percent int16) schema.EntitlementUsage {
	return schema.EntitlementUsage{
		EntitlementID:   uuid.New(),
		EntitlementSlug: slug,
		LicenseID:       licenseID,
		LicenseSlug:     "pro-v1",
		Value:           schema.EntitlementValue{Number: &schema.NumberEntitlementValue{Type: "number", Value: used, EventCount: events}},
		Limit:           &schema.EntitlementValue{Number: &schema.NumberEntitlementValue{Type: "number", Value: limit}},

		LimitCapExceededOveragePercent: &percent,
		Source:                         schema.SourceAddon,
	}
}

func definition(t *testing.T, sources ...string) catalogue.Combined {
	t.Helper()
	weights := map[string]string{"firecrawl-credits": "0.4", "ai-credits": "0.6", "pages": "2.5"}
	combined := catalogue.Combined{ID: combinedID, Slug: "credits"}
	for _, slug := range sources {
		weight, err := decimal.NewFromString(weights[slug])
		require.NoError(t, err)
		combined.Sources = append(combined.Sources, catalogue.CombinedSource{Slug: slug, Weight: weight})
	}
	return combined
}

func TestWithCombined_ADRExample(t *testing.T) {
	usages := []schema.EntitlementUsage{
		granted("firecrawl-credits", 300, 1000, 3, 0),
		granted("ai-credits", 100, 1000, 2, 0),
		granted("seats", 4, 10, 1, 0),
	}

	got, err := WithCombined(usages, []catalogue.Combined{definition(t, "firecrawl-credits", "ai-credits")})
	require.NoError(t, err)

	require.Len(t, got, 4, "the combined entitlement is appended after what the instance is granted")
	for i, slug := range []string{"firecrawl-credits", "ai-credits", "seats"} {
		require.Equal(t, slug, got[i].EntitlementSlug, "the rows MapUsageRows made are left as they are")
	}

	credits := got[3]
	require.Equal(t, combinedID, credits.EntitlementID)
	require.Equal(t, "credits", credits.EntitlementSlug)
	require.Equal(t, licenseID, credits.LicenseID)
	require.Equal(t, "pro-v1", credits.LicenseSlug)
	require.NotNil(t, credits.Value.Number)
	require.InDelta(t, 180, credits.Value.Number.Value, 0)
	require.EqualValues(t, 5, credits.Value.Number.EventCount, "the sum of theirs")
	require.NotNil(t, credits.Limit)
	require.InDelta(t, 1000, credits.Limit.Number.Value, 0)
	require.NotNil(t, credits.LimitCapExceededOveragePercent)
	require.EqualValues(t, 0, *credits.LimitCapExceededOveragePercent)
	require.Equal(t, schema.SourceLicense, credits.Source, "the closed enum of the response is not widened")
	require.Nil(t, credits.Provenance)
	require.Nil(t, credits.Reserved)
	require.Nil(t, credits.CurrentPeriodStart, "lifetime sources, a lifetime sum")
	require.Equal(t, []schema.CombinedSourceUsage{
		{EntitlementSlug: "firecrawl-credits", Weight: "0.4", Usage: 300, Limit: 1000},
		{EntitlementSlug: "ai-credits", Weight: "0.6", Usage: 100, Limit: 1000},
	}, credits.Sources, "the detail is each source's own usage and limit, before its weight")
}

func TestWithCombined_OnlyTheSourcesTheInstanceIsGranted(t *testing.T) {
	usages := []schema.EntitlementUsage{granted("ai-credits", 100, 1000, 2, 0), granted("seats", 4, 10, 1, 0)}

	got, err := WithCombined(usages, []catalogue.Combined{definition(t, "firecrawl-credits", "ai-credits")})
	require.NoError(t, err)

	credits := got[len(got)-1]
	require.Equal(t, "credits", credits.EntitlementSlug, "it exists as soon as one source is granted")
	require.InDelta(t, 60, credits.Value.Number.Value, 0)
	require.InDelta(t, 600, credits.Limit.Number.Value, 0)
	require.Len(t, credits.Sources, 1)
	require.Equal(t, "ai-credits", credits.Sources[0].EntitlementSlug)
}

func TestWithCombined_NoSourceGrantedIsNoRow(t *testing.T) {
	usages := []schema.EntitlementUsage{granted("seats", 4, 10, 1, 0)}

	got, err := WithCombined(usages, []catalogue.Combined{definition(t, "firecrawl-credits", "ai-credits")})
	require.NoError(t, err)
	require.Equal(t, usages, got)

	got, err = WithCombined(nil, []catalogue.Combined{definition(t, "firecrawl-credits", "ai-credits")})
	require.NoError(t, err)
	require.Empty(t, got)
}

func TestWithCombined_NoDefinitionIsTheRowsAsTheyAre(t *testing.T) {
	usages := []schema.EntitlementUsage{granted("seats", 4, 10, 1, 0)}

	got, err := WithCombined(usages, nil)
	require.NoError(t, err)
	require.Equal(t, usages, got)
}

func TestWithCombined_UnlimitedWhenOneGrantedSourceIs(t *testing.T) {
	usages := []schema.EntitlementUsage{granted("firecrawl-credits", 300, 1000, 3, 0), granted("ai-credits", 100, -1, 2, -1)}

	got, err := WithCombined(usages, []catalogue.Combined{definition(t, "firecrawl-credits", "ai-credits")})
	require.NoError(t, err)

	credits := got[len(got)-1]
	require.InDelta(t, -1, credits.Limit.Number.Value, 0)
	require.EqualValues(t, -1, *credits.LimitCapExceededOveragePercent)
	require.InDelta(t, 180, credits.Value.Number.Value, 0, "still the weighted sum")
}

func TestWithCombined_EnforcesNothingOnTheSum(t *testing.T) {
	// A soft source can be used past its limit, and then the sum reads above its
	// own: 1200 of 1000 counted at 2.5 and 100 of 1000 counted at 0.4 is 3040 of
	// 2900. Nothing is refused for it, and the sum is not soft because a source is.
	usages := []schema.EntitlementUsage{granted("pages", 1200, 1000, 1, 50), granted("firecrawl-credits", 100, 1000, 1, 0)}

	got, err := WithCombined(usages, []catalogue.Combined{definition(t, "pages", "firecrawl-credits")})
	require.NoError(t, err)

	credits := got[len(got)-1]
	require.InDelta(t, 3040, credits.Value.Number.Value, 0)
	require.InDelta(t, 2900, credits.Limit.Number.Value, 0)
	require.EqualValues(t, 0, *credits.LimitCapExceededOveragePercent)
}

func TestWithCombined_TheWindowTheSourcesShare(t *testing.T) {
	first, second := granted("firecrawl-credits", 300, 1000, 3, 0), granted("ai-credits", 100, 1000, 2, 0)
	first.CurrentPeriodStart, first.CurrentPeriodEnd = &periodStart, &periodEnd
	second.CurrentPeriodStart, second.CurrentPeriodEnd = &periodStart, &periodEnd

	got, err := WithCombined([]schema.EntitlementUsage{first, second}, []catalogue.Combined{definition(t, "firecrawl-credits", "ai-credits")})
	require.NoError(t, err)

	credits := got[len(got)-1]
	require.Equal(t, &periodStart, credits.CurrentPeriodStart)
	require.Equal(t, &periodEnd, credits.CurrentPeriodEnd)
}

func TestWithCombined_OneSourceFeedsSeveralCombinedEntitlements(t *testing.T) {
	other := catalogue.Combined{ID: uuid.New(), Slug: "units", Sources: []catalogue.CombinedSource{
		{Slug: "firecrawl-credits", Weight: decimal.NewFromInt(2)}, {Slug: "pages", Weight: decimal.NewFromInt(1)},
	}}
	usages := []schema.EntitlementUsage{granted("firecrawl-credits", 300, 1000, 3, 0), granted("ai-credits", 100, 1000, 2, 0), granted("pages", 5, 50, 1, 0)}

	got, err := WithCombined(usages, []catalogue.Combined{definition(t, "firecrawl-credits", "ai-credits"), other})
	require.NoError(t, err)

	require.Len(t, got, 5)
	require.InDelta(t, 180, got[3].Value.Number.Value, 0)
	require.Equal(t, "units", got[4].EntitlementSlug)
	require.InDelta(t, 605, got[4].Value.Number.Value, 0)
	require.InDelta(t, 2050, got[4].Limit.Number.Value, 0)
}
