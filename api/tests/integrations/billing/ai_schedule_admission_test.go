package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

func TestScheduledPlanChangeChecksOnlyNewAIAdmission(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("2900", "MONTHLY"))
	ordinary := newVersion(t, "Ordinary target", licenseschema.Published)
	ordinaryPrice := createPrice(t, ordinary.Slug, flatFee("1900", "MONTHLY"))
	ai := newVersion(t, "AI target", licenseschema.Published)
	aiPrice := createPrice(t, ai.Slug, flatFee("3900", "MONTHLY"))
	addon := newAddon(t, map[string]any{"name": "Retained add-on", "slug": "retained-addon"})
	fits(t, addon.Slug, sold.version.Slug)
	fits(t, addon.Slug, ordinary.Slug)
	addonMonthly := flatFee("900", "MONTHLY")
	addonMonthly["isDefault"] = true
	addonPrice(t, addon.Slug, addonMonthly)
	attachment := attach(t, sold.instance.Slug, addon.Slug, 1)
	started := subscribe(t, sold.instance.Slug, map[string]any{"basePriceId": sold.monthly.ID})

	// Existing persisted AI basis, prepared without an off-state API mutation.
	org, actor, pool := testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, uuid.New()
	exec(t, `INSERT INTO entitlement (id,organization_id,name,slug,type,aggregation_method)
		VALUES ($1,$2,'Existing AI','schedule-existing-ai','NUMBER_AI_CREDIT','SUM')`, pool, org)
	for _, licenseID := range []uuid.UUID{sold.version.ID, ai.ID} {
		exec(t, `INSERT INTO license_entitlement (organization_id,license_id,entitlement_id,value,limit_cap_exceeded_overage_percent,created_by_id,updated_by_id)
			VALUES ($1,$2,$3,'{"type":"number","value":10}',0,$4,$4)`, org, licenseID, pool, actor)
	}
	exec(t, `INSERT INTO addon_entitlement (organization_id,addon_id,entitlement_id,value,limit_cap_exceeded_overage_percent,override_behavior,created_by_id,updated_by_id)
		VALUES ($1,$2,$3,'{"type":"number","value":10}',0,'ADD',$4,$4)`, org, addon.ID, pool, actor)
	path := "/api/instances/" + sold.instance.Slug + "/billing/scheduled-change"
	before := len(outboxPayloads(t, "INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED"))
	require.Equal(t, "AIUsage.Disabled", problemCode(t, fiber.StatusForbidden, "PUT", path, map[string]any{"licensePriceId": aiPrice.ID}))
	require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED"), before)
	require.Nil(t, readBilling(t, sold.instance.Slug).ScheduledChange)

	// An ordinary target is not new AI admission, even with existing AI basis.
	scheduled := billingCall(t, "PUT", sold.instance.Slug, "/scheduled-change", map[string]any{"licensePriceId": ordinaryPrice.ID})
	require.NotNil(t, scheduled.ScheduledChange)
	require.Equal(t, ordinaryPrice.ID, scheduled.ScheduledChange.Price.ID)
	require.True(t, scheduled.ScheduledChange.EffectiveAt.Equal(started.CurrentPeriodEnd))
	// Move the sold history together. Backdating only the subscription leaves
	// its activation outside the elapsed period and can add a valid true-up.
	backdateWithInvoices(t, started.ID, 1)
	exec(t, `UPDATE instance_addon SET created_at = created_at - interval '1 month' WHERE id=$1`, attachment.ID)
	closed := closePeriods(t, map[string]any{})
	require.Equal(t, 1, closed.Closed)
	invoice := getInvoice(t, closed.Invoices[0].ID)
	require.EqualValues(t, 2800, invoice.Total, "ordinary new base plus the retained add-on; existing AI basis is not scrubbed")
	require.Len(t, invoice.Lines, 2, "the previous activation already billed the retained quantity")
	for _, line := range invoice.Lines {
		require.Nil(t, line.TrueUp)
	}
	require.Equal(t, ordinaryPrice.ID, readBilling(t, sold.instance.Slug).BasePrice.ID)
}
