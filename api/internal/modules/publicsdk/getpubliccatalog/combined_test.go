package getpubliccatalog

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
)

// combinedRow is what one source of a user-facing combined entitlement is
// granted by one version.
func combinedRow(licenseID uuid.UUID, slug string, displayOrder int32, weight, grant string) db.ListPublicPlanCombinedGrantsRow {
	return db.ListPublicPlanCombinedGrantsRow{
		LicenseID: licenseID, Slug: slug, Name: slug, Type: db.EntitlementTypeNUMBER, DisplayOrder: displayOrder,
		SaleUnitFactor: "", Weight: weight, GrantValue: []byte(`{"type":"number","value":` + grant + `}`),
	}
}

func TestWithCombinedGrants(t *testing.T) {
	pro, free := uuid.New(), uuid.New()

	t.Run("a version grants the weighted sum of what it grants of the sources", func(t *testing.T) {
		grants := map[uuid.UUID][]PublicPlanEntitlement{}
		withCombinedGrants(grants, []db.ListPublicPlanCombinedGrantsRow{
			combinedRow(pro, "credits", 0, "0.4", "1000"),
			combinedRow(pro, "credits", 0, "0.6", "1000"),
			combinedRow(free, "credits", 0, "0.4", "100"),
		})

		require.Len(t, grants[pro], 1)
		credits := grants[pro][0]
		require.Equal(t, "credits", credits.Slug)
		require.Equal(t, "NUMBER", credits.Type)
		require.JSONEq(t, `1000`, string(credits.Value))
		require.False(t, credits.Unlimited)
		require.NotNil(t, credits.LimitCapExceededOveragePercent)
		require.EqualValues(t, 0, *credits.LimitCapExceededOveragePercent)

		require.Len(t, grants[free], 1, "a version that grants one source grants the sum of that one")
		require.JSONEq(t, `40`, string(grants[free][0].Value))
	})

	t.Run("the sum is exact", func(t *testing.T) {
		grants := map[uuid.UUID][]PublicPlanEntitlement{}
		withCombinedGrants(grants, []db.ListPublicPlanCombinedGrantsRow{
			combinedRow(pro, "credits", 0, "0.4", "3"),
			combinedRow(pro, "credits", 0, "0.1", "1"),
		})
		require.JSONEq(t, `1.3`, string(grants[pro][0].Value))
	})

	t.Run("one unlimited source makes the grant unlimited", func(t *testing.T) {
		grants := map[uuid.UUID][]PublicPlanEntitlement{}
		withCombinedGrants(grants, []db.ListPublicPlanCombinedGrantsRow{
			combinedRow(pro, "credits", 0, "0.4", "1000"),
			combinedRow(pro, "credits", 0, "0.6", "-1"),
		})

		credits := grants[pro][0]
		require.True(t, credits.Unlimited)
		require.JSONEq(t, `-1`, string(credits.Value))
		require.EqualValues(t, -1, *credits.LimitCapExceededOveragePercent)
	})

	t.Run("a version that grants none of the sources has no row to sum", func(t *testing.T) {
		grants := map[uuid.UUID][]PublicPlanEntitlement{pro: {{Slug: "seats"}}}
		withCombinedGrants(grants, nil)
		require.Equal(t, map[uuid.UUID][]PublicPlanEntitlement{pro: {{Slug: "seats"}}}, grants)
	})

	t.Run("the plan's list stays in the catalogue's order: display order, then slug", func(t *testing.T) {
		grants := map[uuid.UUID][]PublicPlanEntitlement{pro: {
			{Slug: "api-calls", DisplayOrder: 0}, {Slug: "seats", DisplayOrder: 20}, {Slug: "zeta", DisplayOrder: 20},
		}}
		withCombinedGrants(grants, []db.ListPublicPlanCombinedGrantsRow{
			combinedRow(pro, "credits", 20, "1", "10"),
			combinedRow(pro, "credits", 20, "1", "10"),
			combinedRow(pro, "aaa-first", 5, "1", "10"),
		})

		slugs := make([]string, len(grants[pro]))
		for i, grant := range grants[pro] {
			slugs[i] = grant.Slug
		}
		require.Equal(t, []string{"api-calls", "aaa-first", "credits", "seats", "zeta"}, slugs)
	})

	t.Run("a grant that is no number grants nothing to sum", func(t *testing.T) {
		grants := map[uuid.UUID][]PublicPlanEntitlement{}
		row := combinedRow(pro, "credits", 0, "1", "1")
		row.GrantValue = []byte(`{"type":"boolean","value":true}`)
		withCombinedGrants(grants, []db.ListPublicPlanCombinedGrantsRow{row})
		require.Empty(t, grants[pro])
	})
}
