package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	billingdb "github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// Disposable DB fixture only: an empty request add-on list must still preflight
// the eligible held selection included in the new external ACTIVATION.
func TestExternalActivationClassifiesHeldAddonsWithoutRequestedAddons(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "ordinary-held", 0)
	sold := newSold(t, flatFee("2900", "MONTHLY"))
	addon := newAddon(t, map[string]any{"name": "Held add-on", "slug": "held-ai-admission"})
	addonGrant(t, addon.Slug, "ordinary-held", 1, "ADD")
	fits(t, addon.Slug, sold.version.Slug)
	monthly := flatFee("900", "MONTHLY")
	monthly["isDefault"] = true
	addonPrice(t, addon.Slug, monthly)
	attachment := attach(t, sold.instance.Slug, addon.Slug, 1)
	org := testDb.DefaultData.OrganizationID
	q := billingdb.New(testServer.Dependencies.DB)
	params := billingdb.SubscriptionSelectionHasAIParams{OrganizationID: org, InstanceSlug: sold.instance.Slug, BasePriceID: sold.monthly.ID, MoveToLicenseID: nil, AddonSlugs: []string{}, VoucherCode: nil}
	hasAI, err := q.SubscriptionSelectionHasAI(t.Context(), params)
	require.NoError(t, err)
	require.False(t, hasAI, "an ordinary held add-on must preserve ordinary admission")
	// Prepare pre-existing synthetic AI relations, not an off-state API mutation.
	pool := uuid.New()
	exec(t, `INSERT INTO entitlement (id,organization_id,name,slug,type,aggregation_method) VALUES ($1,$2,'Held AI','held-ai-pool','NUMBER_AI_CREDIT','SUM')`, pool, org)
	exec(t, `INSERT INTO addon_entitlement (organization_id,addon_id,entitlement_id,value,limit_cap_exceeded_overage_percent,override_behavior,created_by_id,updated_by_id) VALUES ($1,$2,$3,'{"type":"number","value":10}',0,'ADD',$4,$4)`, org, addon.ID, pool, testDb.DefaultData.UserID)
	hasAI, err = q.SubscriptionSelectionHasAI(t.Context(), params)
	require.NoError(t, err)
	require.True(t, hasAI, "held AI must be classified with an empty requested add-on list")
	var before int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM instance_billing WHERE instance_id=$1`, sold.instance.ID).Scan(&before))
	problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "POST", "/api/instances/"+sold.instance.Slug+"/billing", map[string]any{"basePriceId": sold.monthly.ID}), fiber.StatusForbidden)
	require.Equal(t, "AIUsage.Disabled", problem.Code)
	var after int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM instance_billing WHERE instance_id=$1`, sold.instance.ID).Scan(&after))
	require.Equal(t, before, after)
	exec(t, `UPDATE instance_addon SET pending_quantity=0 WHERE id=$1`, attachment.ID)
	hasAI, err = q.SubscriptionSelectionHasAI(t.Context(), params)
	require.NoError(t, err)
	require.False(t, hasAI, "a scheduled removal is excluded just as in activation billing")
	exec(t, `UPDATE instance_addon SET pending_quantity=NULL,removed_at=now() WHERE id=$1`, attachment.ID)
	hasAI, err = q.SubscriptionSelectionHasAI(t.Context(), params)
	require.NoError(t, err)
	require.False(t, hasAI, "historical removed attachments remain raw financial evidence, not new admission")
	params.OrganizationID = uuid.New()
	hasAI, err = q.SubscriptionSelectionHasAI(t.Context(), params)
	require.NoError(t, err)
	require.False(t, hasAI, "held identities are tenant scoped")
}
