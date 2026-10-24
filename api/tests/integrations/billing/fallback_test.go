package billing_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// fallbackSold is a Pro family naming a FREE Starter family as its fallback,
// a monthly price on Pro, and an instance on it holding two FREE add-ons:
// extra seats, compatible with Pro only, and support, with both.
type fallbackSold struct {
	starter, pro publicVersion
	monthly      string
	instance     instanceschema.Instance
}

func newFallbackSold(t *testing.T) fallbackSold {
	t.Helper()
	starter := newDefaultVersion(t, "Starter", "FREE")
	pro := newDefaultVersion(t, "Pro", "PAID")
	require.Equal(t, fiber.StatusOK, call(t, "PATCH", "/api/license-families/"+pro.FamilySlug,
		map[string]any{"fallbackLicenseFamilySlug": starter.FamilySlug}).StatusCode)
	monthly := createPrice(t, pro.Slug, flatFee("2900", "MONTHLY"))
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, pro.ID)

	seats := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "pricingType": "FREE"})
	fits(t, seats.Slug, pro.FamilySlug)
	support := newAddon(t, map[string]any{"name": "Support", "slug": "support", "pricingType": "FREE"})
	fits(t, support.Slug, pro.FamilySlug)
	fits(t, support.Slug, starter.FamilySlug)
	attach(t, instance.Slug, seats.Slug, 1)
	attach(t, instance.Slug, support.Slug, 1)
	return fallbackSold{starter: starter, pro: pro, monthly: monthly.ID.String(), instance: instance}
}

func readInstance(t *testing.T, slug string) instanceschema.Instance {
	t.Helper()
	return commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+slug, nil), fiber.StatusOK)
}

// heldAddons is the slugs of the add-ons the instance holds now.
func heldAddons(t *testing.T, s fallbackSold) []string {
	t.Helper()
	rows, err := testDb.DbPool.Query(t.Context(),
		`SELECT a.slug FROM instance_addon ia JOIN addon a ON a.id = ia.addon_id
		  WHERE ia.instance_id = $1 AND ia.removed_at IS NULL ORDER BY a.slug`, s.instance.ID)
	require.NoError(t, err)
	defer rows.Close()
	var slugs []string
	for rows.Next() {
		var slug string
		require.NoError(t, rows.Scan(&slug))
		slugs = append(slugs, slug)
	}
	return slugs
}

// requireFellBack checks the move of §9.11: the instance on Starter's default
// version with its licence dates untouched, INSTANCE_UPDATED saying
// BILLING_FALLBACK with instance.billing.canceled, and only the add-on
// Starter is not compatible with removed, at the cancellation instant.
func requireFellBack(t *testing.T, s fallbackSold, canceledAt time.Time) {
	t.Helper()
	moved := readInstance(t, s.instance.Slug)
	require.Equal(t, s.starter.ID, moved.LicenseID, "moved to the fallback's default PUBLISHED version")
	require.True(t, moved.StartLicenseDate.Equal(s.instance.StartLicenseDate), "D-13: the licence dates are the vendor's")
	require.True(t, moved.EndLicenseDate.Equal(s.instance.EndLicenseDate))

	// Both are written in the cancellation's transaction, canceled first; CDC
	// delivers them in that order, which occurred_at (one per transaction)
	// cannot show here.
	require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_CANCELED"), 1)
	updated := outboxPayloads(t, "INSTANCE_UPDATED")
	require.Len(t, updated, 1)
	require.Equal(t, "BILLING_FALLBACK", updated[0]["licenseChangeReason"])
	require.Equal(t, s.starter.ID.String(), updated[0]["licenseId"])

	require.Equal(t, []string{"support"}, heldAddons(t, s), "the add-on Starter is compatible with stays")
	removed := outboxPayloads(t, "INSTANCE_ADDON_REMOVED")
	require.Len(t, removed, 1)
	require.Equal(t, "extra-seats", removed[0]["addonSlug"])
	var removedAt time.Time
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT ia.removed_at FROM instance_addon ia JOIN addon a ON a.id = ia.addon_id WHERE ia.instance_id = $1 AND a.slug = 'extra-seats'`,
		s.instance.ID).Scan(&removedAt))
	require.WithinDuration(t, canceledAt, removedAt, time.Millisecond, "removed at the cancellation instant")
}

// TestFallbackMove: every cancellation of a subscription whose family names a
// fallback moves the instance to it, in the same transaction (§9.11, V31-66).
func TestFallbackMove(t *testing.T) {
	t.Run("AnImmediateCancel_MovesTheInstanceToTheFallback", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newFallbackSold(t)
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly, "trialDays": 0})
		canceled := cancel(t, s.instance.Slug, map[string]any{"mode": "IMMEDIATE"})
		require.Equal(t, subscriptions.StatusCanceled, canceled.Status)
		require.NotNil(t, canceled.FinalInvoice)
		requireFellBack(t, s, *canceled.CanceledAt)
	})

	t.Run("ACanceledTrial_FallsBackToo", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newFallbackSold(t)
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly, "trialDays": 14})
		canceled := cancel(t, s.instance.Slug, map[string]any{})
		require.Equal(t, subscriptions.StatusCanceled, canceled.Status)
		require.Nil(t, canceled.FinalInvoice)
		requireFellBack(t, s, *canceled.CanceledAt)
	})

	t.Run("AtPeriodEnd_TheCloseMovesIt_NotTheRequest", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newFallbackSold(t)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly, "trialDays": 0})
		cancel(t, s.instance.Slug, map[string]any{"mode": "AT_PERIOD_END"})
		require.Equal(t, s.pro.ID, readInstance(t, s.instance.Slug).LicenseID, "the period paid in advance runs out on Pro")

		backdate(t, started.ID, 1)
		exec(t, `UPDATE instance_addon SET created_at = created_at - interval '1 month' WHERE instance_id = $1`, s.instance.ID)
		require.Equal(t, 1, closePeriods(t, map[string]any{}).Closed)
		billing := readBilling(t, s.instance.Slug)
		require.Equal(t, subscriptions.StatusCanceled, billing.Status)
		requireFellBack(t, s, *billing.CanceledAt)
	})

	// The move re-checks the fallback at the cancellation (§9.11 rule 6). The
	// API keeps a fallback FREE and its default version in place, so the two
	// edges are written behind its back.
	for name, edge := range map[string]string{
		"AFallbackNoLongerFree_IsSkipped_AndTheCancelCommits":                    `UPDATE license SET pricing_type = 'PAID' WHERE id = $1`,
		"AFallbackWithoutADefaultPublishedVersion_IsSkipped_AndTheCancelCommits": `UPDATE license SET is_default = FALSE WHERE id = $1`,
	} {
		t.Run(name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			s := newFallbackSold(t)
			subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly, "trialDays": 0})
			exec(t, edge, s.starter.ID)

			canceled := cancel(t, s.instance.Slug, map[string]any{"mode": "IMMEDIATE"})
			require.Equal(t, subscriptions.StatusCanceled, canceled.Status)
			require.Equal(t, s.pro.ID, readInstance(t, s.instance.Slug).LicenseID, "the licence stays")
			require.Empty(t, outboxPayloads(t, "INSTANCE_UPDATED"))
			require.Equal(t, []string{"extra-seats", "support"}, heldAddons(t, s), "nothing moved, nothing stranded")
		})
	}

	t.Run("WithoutAFallback_TheInstanceKeepsItsLicence", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "trialDays": 0})
		cancel(t, s.instance.Slug, map[string]any{"mode": "IMMEDIATE"})
		require.Equal(t, s.version.ID, readInstance(t, s.instance.Slug).LicenseID)
		require.Empty(t, outboxPayloads(t, "INSTANCE_UPDATED"))
	})
}
