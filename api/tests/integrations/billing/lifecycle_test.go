package billing_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func cancel(t *testing.T, instanceSlug string, body map[string]any) cancelsubscription.CanceledSubscription {
	t.Helper()
	return commonfixture.AssertJSONResponse[cancelsubscription.CanceledSubscription](t,
		call(t, "POST", "/api/instances/"+instanceSlug+"/billing/cancel", body), fiber.StatusOK)
}

func billingCall(t *testing.T, method, instanceSlug, suffix string, body any) subscriptions.InstanceBilling {
	t.Helper()
	return commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
		call(t, method, "/api/instances/"+instanceSlug+"/billing"+suffix, body), fiber.StatusOK)
}

// backdateTrial moves a trial's anchor, period and end back by days.
func backdateTrial(t *testing.T, subscriptionID any, days int) {
	t.Helper()
	exec(t, `UPDATE instance_billing
	            SET anchor_at = anchor_at - make_interval(days => $2), started_at = started_at - make_interval(days => $2),
	                current_period_start = current_period_start - make_interval(days => $2),
	                current_period_end = current_period_end - make_interval(days => $2),
	                trial_ends_at = trial_ends_at - make_interval(days => $2)
	          WHERE id = $1`, subscriptionID, days)
}

func TestTrials(t *testing.T) {
	t.Run("ATrial_BillsNothing_UntilTheCloseConvertsIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "trialDays": 14})
		require.Equal(t, subscriptions.StatusTrial, started.Status)
		require.Nil(t, started.ActivationInvoice)
		require.True(t, started.TrialEndsAt.Equal(started.AnchorAt.Add(14*24*time.Hour)))
		require.True(t, started.CurrentPeriodEnd.Equal(*started.TrialEndsAt))

		backdateTrial(t, started.ID, 15)
		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		require.Equal(t, "ACTIVATION", report.Invoices[0].Kind)
		trialEnd := started.TrialEndsAt.AddDate(0, 0, -15)
		require.True(t, report.Invoices[0].BoundaryAt.Equal(trialEnd))

		billing := readBilling(t, s.instance.Slug)
		require.Equal(t, subscriptions.StatusActive, billing.Status)
		require.True(t, billing.AnchorAt.Equal(trialEnd))
		require.True(t, billing.CurrentPeriodEnd.Equal(trialEnd.AddDate(0, 1, 0)))
		changes := outboxPayloads(t, "INSTANCE_BILLING_STATUS_CHANGED")
		require.Len(t, changes, 1)
		require.Equal(t, "TRIAL_ENDED", changes[0]["reason"])
	})

	t.Run("TheLicencesTrial_IsTheDefault_AndZeroIsNone", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		exec(t, `UPDATE license SET trial_period_days = 7 WHERE id = $1`, s.version.ID)
		require.Equal(t, "SubscribeInstance.InvalidTrialDays", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/instances/"+s.instance.Slug+"/billing", map[string]any{"basePriceId": s.monthly.ID, "trialDays": -1}))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, subscriptions.StatusTrial, started.Status)

		customer := newCustomer(t, "globex")
		other := newInstance(t, "Globex", customer.ID, s.version.ID)
		require.Equal(t, subscriptions.StatusActive, subscribe(t, other.Slug, map[string]any{"basePriceId": s.monthly.ID, "trialDays": 0}).Status)
	})

	t.Run("ACanceledTrial_IsCanceledAtOnce_WithoutAnInvoice", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "trialDays": 14})
		canceled := cancel(t, s.instance.Slug, map[string]any{})
		require.Equal(t, subscriptions.StatusCanceled, canceled.Status)
		require.Nil(t, canceled.FinalInvoice)
		require.Empty(t, listInvoices(t, "/api/invoices").Items)
	})
}

func TestCancelAndReactivate(t *testing.T) {
	t.Run("AtPeriodEnd_ThePeriodRunsOut_ThenTheFinalInvoiceCancels", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		arrears := flatFee("2900", "MONTHLY")
		arrears["billingTiming"] = "ARREARS"
		s := newSold(t, arrears)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})

		scheduled := cancel(t, s.instance.Slug, map[string]any{"reason": "moving on"})
		require.Equal(t, subscriptions.StatusActive, scheduled.Status)
		require.True(t, scheduled.CancelAtPeriodEnd)
		cancel(t, s.instance.Slug, map[string]any{})
		require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_CANCELLATION_SCHEDULED"), 1, "a second request changes nothing")

		backdate(t, started.ID, 1)
		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		require.Equal(t, "FINAL", report.Invoices[0].Kind)
		final := getInvoice(t, report.Invoices[0].ID)
		require.Len(t, final.Lines, 1, "the arrears base of the period that ended")
		require.EqualValues(t, 2900, final.Total)

		billing := readBilling(t, s.instance.Slug)
		require.Equal(t, subscriptions.StatusCanceled, billing.Status)
		require.True(t, billing.CanceledAt.Equal(started.CurrentPeriodEnd.AddDate(0, -1, 0)), "at the backdated boundary")
		canceled := outboxPayloads(t, "INSTANCE_BILLING_CANCELED")
		require.Len(t, canceled, 1)
		require.Equal(t, final.ID.String(), canceled[0]["finalInvoiceId"])
		require.Equal(t, 0, closePeriods(t, map[string]any{}).Closed, "a canceled subscription is never due")
	})

	t.Run("AScheduledCancellation_CanBeReverted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, "ReactivateSubscription.NotScheduledForCancellation", problemCode(t, fiber.StatusConflict, "POST",
			"/api/instances/"+s.instance.Slug+"/billing/reactivate", nil))
		cancel(t, s.instance.Slug, map[string]any{})
		reactivated := billingCall(t, "POST", s.instance.Slug, "/reactivate", nil)
		require.False(t, reactivated.CancelAtPeriodEnd)
		require.Nil(t, reactivated.CancelRequestedAt)
		require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_CANCELLATION_REVERTED"), 1)
	})

	t.Run("Immediately_TheFinalInvoiceBillsTheUsageSoFar", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := meteredSold(t)
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		reportTokens(t, s.instance.Slug, 130500)

		canceled := cancel(t, s.instance.Slug, map[string]any{"mode": "IMMEDIATE"})
		require.Equal(t, subscriptions.StatusCanceled, canceled.Status)
		require.NotNil(t, canceled.FinalInvoice)
		require.Equal(t, "FINAL", canceled.FinalInvoice.Kind)
		final := getInvoice(t, canceled.FinalInvoice.ID)
		require.Len(t, final.Lines, 1)
		require.EqualValues(t, 2440, final.Lines[0].Amount)

		require.Equal(t, "CancelSubscription.NotActive", problemCode(t, fiber.StatusConflict, "POST",
			"/api/instances/"+s.instance.Slug+"/billing/cancel", map[string]any{}))
		require.Equal(t, "ReactivateSubscription.Canceled", problemCode(t, fiber.StatusConflict, "POST",
			"/api/instances/"+s.instance.Slug+"/billing/reactivate", nil))
	})

	t.Run("AnEndedPeriodNotYetClosed_RefusesChanges", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		backdate(t, started.ID, 1)
		require.Equal(t, "CancelSubscription.BoundaryPending", problemCode(t, fiber.StatusConflict, "POST",
			"/api/instances/"+s.instance.Slug+"/billing/cancel", map[string]any{}))
		require.Equal(t, "UpdateInstanceBilling.BoundaryPending", problemCode(t, fiber.StatusConflict, "PATCH",
			"/api/instances/"+s.instance.Slug+"/billing", map[string]any{"daysUntilDue": 3}))
	})
}

func TestPlanChanges(t *testing.T) {
	t.Run("AScheduledChange_IsAppliedByTheNextRenewal", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		scale := newVersion(t, "Scale", licenseschema.Published)
		annual := createPrice(t, scale.Slug, flatFee("49000", "ANNUAL"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})

		scheduled := billingCall(t, "PUT", s.instance.Slug, "/scheduled-change", map[string]any{"licensePriceId": annual.ID})
		require.NotNil(t, scheduled.ScheduledChange)
		require.Equal(t, annual.ID, scheduled.ScheduledChange.Price.ID)
		require.True(t, scheduled.ScheduledChange.EffectiveAt.Equal(started.CurrentPeriodEnd))
		billingCall(t, "PUT", s.instance.Slug, "/scheduled-change", map[string]any{"licensePriceId": annual.ID})
		require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED"), 1, "the same target again changes nothing")

		require.Equal(t, "DeprecateLicensePrice.PlanChangeTarget", problemCode(t, fiber.StatusConflict, "POST",
			"/api/licenses/"+scale.Slug+"/prices/"+annual.ID.String()+"/deprecate", nil))
		require.Equal(t, "ArchiveLicense.PlanChangeTarget", problemCode(t, fiber.StatusConflict, "POST",
			"/api/licenses/"+scale.Slug+"/archive", nil))

		backdate(t, started.ID, 1)
		report := closePeriods(t, map[string]any{})
		require.Equal(t, 1, report.Closed)
		renewal := getInvoice(t, report.Invoices[0].ID)
		require.Len(t, renewal.Lines, 1)
		require.EqualValues(t, 49000, renewal.Lines[0].Amount, "the new plan's year, in advance")
		require.Equal(t, annual.ID, *renewal.Lines[0].LicensePriceID)

		billing := readBilling(t, s.instance.Slug)
		require.Equal(t, annual.ID, billing.BasePrice.ID)
		require.Equal(t, "ANNUAL", billing.BillingPeriod)
		require.Nil(t, billing.ScheduledChange)
		boundary := started.CurrentPeriodEnd.AddDate(0, -1, 0)
		require.True(t, billing.AnchorAt.Equal(boundary), "the change anchors the new periods")
		require.True(t, billing.CurrentPeriodEnd.Equal(boundary.AddDate(1, 0, 0)))
		var licenseID string
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `SELECT license_id::text FROM instance WHERE id = $1`, s.instance.ID).Scan(&licenseID))
		require.Equal(t, scale.ID.String(), licenseID, "the instance moved to the new version")
		require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_PLAN_CHANGED"), 1)
	})

	t.Run("TheTarget_IsChecked", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		draft := newVersion(t, "Draft", licenseschema.Draft)
		unpublished := createPrice(t, draft.Slug, flatFee("100", "MONTHLY"))
		dollars := newVersion(t, "US", licenseschema.Published)
		usd := flatFee("100", "MONTHLY")
		usd["currency"] = "USD"
		inDollars := createPrice(t, dollars.Slug, usd)
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		path := "/api/instances/" + s.instance.Slug + "/billing/scheduled-change"

		require.Equal(t, "CancelPlanChange.NoPlanChangeScheduled", problemCode(t, fiber.StatusConflict, "DELETE", path, nil))
		for code, id := range map[string]any{
			"SchedulePlanChange.SamePrice":           s.monthly.ID,
			"SchedulePlanChange.LicenseNotPublished": unpublished.ID,
			"SchedulePlanChange.CurrencyMismatch":    inDollars.ID,
		} {
			require.Equal(t, code, problemCode(t, fiber.StatusUnprocessableEntity, "PUT", path, map[string]any{"licensePriceId": id}))
		}

		target := createPrice(t, newVersion(t, "Scale", licenseschema.Published).Slug, flatFee("4900", "MONTHLY"))
		billingCall(t, "PUT", s.instance.Slug, "/scheduled-change", map[string]any{"licensePriceId": target.ID})
		cancel(t, s.instance.Slug, map[string]any{})
		require.Nil(t, readBilling(t, s.instance.Slug).ScheduledChange, "a cancellation drops the change")
		require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_PLAN_CHANGE_CANCELLED"), 1)
	})

	t.Run("ATrial_CannotChangePlan", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "trialDays": 7})
		require.Equal(t, "SchedulePlanChange.TrialInProgress", problemCode(t, fiber.StatusConflict, "PUT",
			"/api/instances/"+s.instance.Slug+"/billing/scheduled-change", map[string]any{"licensePriceId": s.monthly.ID}))
	})
}

func TestPastDue(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	overdue := lifecycle.NewOverdue(uow.NewUnitOfWork(testDb.DbPool))

	moved, err := overdue.Pass(t.Context(), 100)
	require.NoError(t, err)
	require.Zero(t, moved)

	exec(t, `UPDATE instance_invoice SET due_at = issued_at, days_until_due = 0, issued_at = issued_at WHERE id = $1`, started.ActivationInvoice.ID)
	moved, err = overdue.Pass(t.Context(), 100)
	require.NoError(t, err)
	require.Equal(t, 1, moved)
	billing := readBilling(t, s.instance.Slug)
	require.Equal(t, subscriptions.StatusPastDue, billing.Status)
	require.NotNil(t, billing.PastDueSince)

	act(t, started.ActivationInvoice.ID, "mark-paid", map[string]any{}, fiber.StatusOK)
	billing = readBilling(t, s.instance.Slug)
	require.Equal(t, subscriptions.StatusActive, billing.Status, "settling it clears PAST_DUE at once")
	require.Nil(t, billing.PastDueSince)
	var reasons []any
	for _, change := range outboxPayloads(t, "INSTANCE_BILLING_STATUS_CHANGED") {
		reasons = append(reasons, change["reason"])
	}
	require.ElementsMatch(t, []any{"INVOICE_OVERDUE", "SETTLED"}, reasons)
}

func TestSubscriptionTerms(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})

	own := billingCall(t, "PATCH", s.instance.Slug, "", map[string]any{"daysUntilDue": 7, "collectionMethod": "SEND_INVOICE"})
	require.EqualValues(t, 7, *own.DaysUntilDueOverride)
	require.Equal(t, "SEND_INVOICE", *own.CollectionMethodOverride)

	kept := billingCall(t, "PATCH", s.instance.Slug, "", map[string]any{})
	require.EqualValues(t, 7, *kept.DaysUntilDueOverride, "an omitted member is left alone")

	back := billingCall(t, "PATCH", s.instance.Slug, "", map[string]any{"daysUntilDue": nil})
	require.Nil(t, back.DaysUntilDueOverride, "null restores the organization's default")
	require.EqualValues(t, 30, back.DaysUntilDue)
	require.Equal(t, "UpdateInstanceBilling.InvalidDaysUntilDue", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH",
		"/api/instances/"+s.instance.Slug+"/billing", map[string]any{"daysUntilDue": 400}))
	_ = invoices.StatusManual
}
