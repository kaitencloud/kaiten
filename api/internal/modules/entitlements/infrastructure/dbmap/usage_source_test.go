package dbmap_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// usageSource is meaningful for the NUMBER family only: the column is stored,
// defaulted, on every row, and BOOLEAN and CONFIG never expose it.
func TestToEntitlement_UsageSourceIsReportedForTheNumberFamilyOnly(t *testing.T) {
	for _, tt := range []struct {
		entitlementType db.EntitlementType
		stored          db.EntitlementUsageSource
		want            *schema.UsageSource
	}{
		{db.EntitlementTypeNUMBER, db.EntitlementUsageSourceCALCULATEDUSAGE, usageSource(schema.CalculatedUsage)},
		{db.EntitlementTypeNUMBER, db.EntitlementUsageSourceCOMBINEDUSAGE, usageSource(schema.CombinedUsage)},
		{db.EntitlementTypeNUMBERAICREDIT, db.EntitlementUsageSourceCALCULATEDUSAGE, usageSource(schema.CalculatedUsage)},
		{db.EntitlementTypeBOOLEAN, db.EntitlementUsageSourceCALCULATEDUSAGE, nil},
		{db.EntitlementTypeCONFIG, db.EntitlementUsageSourceCALCULATEDUSAGE, nil},
	} {
		t.Run(string(tt.entitlementType)+"/"+string(tt.stored), func(t *testing.T) {
			got := dbmap.ToEntitlement(&db.Entitlement{Type: tt.entitlementType, UsageSource: tt.stored})

			require.Equal(t, tt.want, got.UsageSource)
			require.Nil(t, got.Sources, "the sources are attached by the loaders, which read them")
		})
	}
}

func usageSource(s schema.UsageSource) *schema.UsageSource { return &s }

func TestToEntitlementSources(t *testing.T) {
	got := dbmap.ToEntitlementSources([]db.ListCombinedSourcesRow{
		{CombinedSlug: "credits", SourceSlug: "ai-credits", Weight: "0.6"},
		{CombinedSlug: "credits", SourceSlug: "firecrawl-credits", Weight: "0.4"},
	})

	require.Equal(t, []schema.EntitlementSource{
		{EntitlementSlug: "ai-credits", Weight: "0.6"}, {EntitlementSlug: "firecrawl-credits", Weight: "0.4"},
	}, got)
}
