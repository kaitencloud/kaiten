package stripe_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// trialWithCard is a 14-day trial charged automatically to a card saved
// before it, on a family naming a FREE Starter family as its fallback and
// doing behavior at the trial's end without a card.
func trialWithCard(t *testing.T, behavior string) (sold, licenseschema.License, subscribeinstance.StartedSubscription) {
	t.Helper()
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	starter := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": "Starter", "description": "d", "type": "PAID", "isDefault": true, "lifecycleState": licenseschema.Published, "pricingType": "FREE",
	}), fiber.StatusCreated)
	require.Equal(t, fiber.StatusOK, call(t, "PATCH", "/api/license-families/"+planFamilySlugOf(t, s.version.FamilyID.String()), map[string]any{
		"fallbackLicenseFamilySlug": planFamilySlugOf(t, starter.FamilyID.String()), "trialEndWithoutPaymentMethod": behavior,
	}).StatusCode)
	saveCard(t, s, stripefake.CardSucceeds)
	started := commonfixture.AssertJSONResponse[subscribeinstance.StartedSubscription](t,
		call(t, "POST", "/api/instances/"+s.instance.Slug+"/billing", map[string]any{
			"basePriceId": s.monthly.ID, "providerKind": "STRIPE", "collectionMethod": "CHARGE_AUTOMATICALLY", "trialDays": 14,
		}), fiber.StatusCreated)
	require.Equal(t, "TRIAL", started.Status)
	return s, starter, started
}

// endTrialWithoutCard expires the card, as §12.5 would, then reaches the
// trial's end and closes it.
func endTrialWithoutCard(t *testing.T, started subscribeinstance.StartedSubscription) closing.ClosePeriodsReport {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE customer_billing SET payment_method_status = 'EXPIRED'`)
	require.NoError(t, err)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE instance_billing
	    SET anchor_at = anchor_at - interval '15 days', started_at = started_at - interval '15 days',
	        current_period_start = current_period_start - interval '15 days', current_period_end = current_period_end - interval '15 days',
	        trial_ends_at = trial_ends_at - interval '15 days', trial_will_end_at = trial_will_end_at - interval '15 days'
	  WHERE id = $1`, started.ID)
	require.NoError(t, err)
	return commonfixture.AssertJSONResponse[closing.ClosePeriodsReport](t, call(t, "POST", "/api/billing/close-periods", map[string]any{}), fiber.StatusOK)
}

// TestTrialEndWithoutACard: a trial charged automatically whose card is no
// longer ACTIVE at trial_ends_at, with an amount due, does what its family
// says (§9.2 rule 4, V31-65).
func TestTrialEndWithoutACard(t *testing.T) {
	t.Run("OnCancel_ItIsCanceledWithoutAnInvoice_AndFallsBack", func(t *testing.T) {
		s, starter, started := trialWithCard(t, "CANCEL")
		report := endTrialWithoutCard(t, started)
		require.Equal(t, 1, report.Closed)
		require.Empty(t, report.Invoices, "the composed ACTIVATION is discarded")

		after := billing(t, s)
		require.Equal(t, "CANCELED", after.Status)
		require.Equal(t, "TRIAL_ENDED_WITHOUT_PAYMENT_METHOD", *after.CancellationReason)
		require.True(t, after.CanceledAt.Equal(started.TrialEndsAt.Add(-15*24*time.Hour)), "canceled at trial_ends_at")
		var issued int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM instance_invoice`).Scan(&issued))
		require.Zero(t, issued)
		require.Empty(t, fake.CallsOf(stripefake.OpCreateInvoice), "nothing reaches Stripe")

		var canceled map[string]any
		for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
			if event.EventName == "INSTANCE_BILLING_CANCELED" {
				require.NoError(t, json.Unmarshal(event.Data, &canceled))
			}
		}
		require.Equal(t, "IMMEDIATE", canceled["mode"])
		require.Nil(t, canceled["finalInvoiceId"])
		require.Equal(t, "TRIAL_ENDED_WITHOUT_PAYMENT_METHOD", canceled["cancellationReason"])

		instance := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+s.instance.Slug, nil), fiber.StatusOK)
		require.Equal(t, starter.ID, instance.LicenseID, "the fallback move follows")
		require.Equal(t, 1, outboxCount(t, "INSTANCE_UPDATED"))
	})

	t.Run("OnConvert_TheTrialConverts_AndItsActivationIsIssued", func(t *testing.T) {
		s, _, started := trialWithCard(t, "CONVERT")
		report := endTrialWithoutCard(t, started)
		require.Equal(t, 1, report.Closed)
		require.Len(t, report.Invoices, 1)
		require.Equal(t, "ACTIVATION", report.Invoices[0].Kind)
		require.NotEqual(t, "CANCELED", billing(t, s).Status)
		require.Equal(t, s.version.ID, commonfixture.AssertJSONResponse[instanceschema.Instance](t,
			call(t, "GET", "/api/instances/"+s.instance.Slug, nil), fiber.StatusOK).LicenseID)
	})

	t.Run("WithAnActiveCard_TheTrialAlwaysConverts", func(t *testing.T) {
		s, _, started := trialWithCard(t, "CANCEL")
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE instance_billing
		    SET anchor_at = anchor_at - interval '15 days', started_at = started_at - interval '15 days',
		        current_period_start = current_period_start - interval '15 days', current_period_end = current_period_end - interval '15 days',
		        trial_ends_at = trial_ends_at - interval '15 days', trial_will_end_at = trial_will_end_at - interval '15 days'
		  WHERE id = $1`, started.ID)
		require.NoError(t, err)
		report := commonfixture.AssertJSONResponse[closing.ClosePeriodsReport](t, call(t, "POST", "/api/billing/close-periods", map[string]any{}), fiber.StatusOK)
		require.Len(t, report.Invoices, 1)
		waitFor(t, report.Invoices[0].ID, func(i invoices.Invoice) bool { return i.Status == "PAID" }, "charged")
		require.Equal(t, "ACTIVE", billing(t, s).Status)
	})
}
